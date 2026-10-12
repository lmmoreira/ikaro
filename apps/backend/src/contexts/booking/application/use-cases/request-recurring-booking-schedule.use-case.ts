import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_RECURRING_HORIZON_DAYS } from '@ikaro/types';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { BookingServiceNotInTenantError } from '../../domain/errors/booking-domain.error';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { assertValidTerm, RecurrenceRule } from '../../domain/recurrence-rule.helpers';
import { Resource } from '../../domain/resource.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import { BOOKING_CUSTOMER_PORT, IBookingCustomerPort } from '../ports/booking-customer.port';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import {
  BOOKING_PLATFORM_PORT,
  IBookingPlatformPort,
  TenantBookingWindow,
} from '../ports/booking-platform.port';
import { BOOKING_STAFF_PORT, IBookingStaffPort } from '../ports/booking-staff.port';
import {
  IRecurringBookingScheduleRepository,
  RECURRING_BOOKING_SCHEDULE_REPOSITORY,
} from '../ports/recurring-booking-schedule-repository.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import {
  IScheduleClosureRepository,
  SCHEDULE_CLOSURE_REPOSITORY,
} from '../ports/schedule-closure-repository.port';
import {
  IScheduleOpeningRepository,
  SCHEDULE_OPENING_REPOSITORY,
} from '../ports/schedule-opening-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { materializeRecurringScheduleOccurrences } from './materialize-recurring-schedule-occurrences.helpers';
import { resolveApprovalMode } from './service-result.mapper';
import { assertUnderCap } from './recurring-booking-schedule-cap.helpers';
import {
  assertServiceEligible,
  buildResourceAssignments,
} from './recurring-booking-schedule-eligibility.helpers';
import {
  assertPatternConflictFree,
  ConflictCheckDeps,
  resolveApprovalStatus,
} from './recurring-booking-schedule-request.helpers';
import {
  PreparedRecurringBookingScheduleRequest,
  buildRequestedSchedule,
  resolveRequestingCustomerId,
} from './recurring-booking-schedule-request-build.helpers';
import {
  ConsideredRequirement,
  resolveAndLockConsidered,
} from './recurring-considered-resources.helpers';
import {
  deriveAssignmentPolicy,
  effectiveRequirements,
  pickCustomerChoices,
  RecurringResourceSelection,
} from './recurring-service-requirement.helpers';
import { resolveStartableOccurrences } from './recurring-booking-schedule-window.helpers';

export interface RequestRecurringBookingScheduleUseCaseInput {
  tenantId: string;
  correlationId: string;
  timezone: string;
  serviceId: string;
  recurrence: RecurrenceRule;
  startsOn: string;
  endsOn: string;
  // One entry per CUSTOMER_CHOICE requirement of the service; the assignment policy is derived from
  // the service, never taken from the caller (TD49 Story 0).
  resourceSelections: RecurringResourceSelection[];
  actorType: 'CUSTOMER' | 'STAFF';
  actorId: string;
  // Present only when a STAFF actor creates on the customer's behalf.
  bodyCustomerId?: string;
  // The tenant's booking window (`settings.booking`) — the ceiling the service's own override is
  // clamped to when the first occurrence is checked (M23-S35).
  tenantBookingWindow: TenantBookingWindow;
  // The customer's previous schedule this request may renew (M23-S35). Never stored.
  renewsScheduleId?: string;
}

export interface RequestRecurringBookingScheduleUseCaseResult {
  id: string;
  status: 'ACTIVE' | 'PENDING_APPROVAL';
  approvalHoldExpiresAt: string | null;
}

@Injectable()
export class RequestRecurringBookingScheduleUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RECURRING_BOOKING_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IRecurringBookingScheduleRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(SCHEDULE_CLOSURE_REPOSITORY) private readonly closureRepo: IScheduleClosureRepository,
    @Inject(SCHEDULE_OPENING_REPOSITORY) private readonly openingRepo: IScheduleOpeningRepository,
    @Inject(BOOKING_CUSTOMER_PORT) private readonly customerPort: IBookingCustomerPort,
    @Inject(BOOKING_STAFF_PORT) private readonly staffPort: IBookingStaffPort,
    @Inject(BOOKING_PLATFORM_PORT) private readonly bookingPlatform: IBookingPlatformPort,
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async execute(
    input: RequestRecurringBookingScheduleUseCaseInput,
  ): Promise<RequestRecurringBookingScheduleUseCaseResult> {
    const customerId = await resolveRequestingCustomerId(
      { staffPort: this.staffPort, customerPort: this.customerPort },
      input,
    );

    // The save() call below must stay textually inside this callback — architecture-check's
    // transactional-save detector requires save() to be lexically nested in the
    // ITransactionManager.run() callback, not merely reachable through a helper method
    // (docs/ENGINEERING_RULES_BACKEND.md § architecture-check's transactional-save detector).
    // prepareRequest() (service eligibility + approval-policy resolution) also lives inside this
    // callback and reads the service via findByIdForUpdate() — a concurrent
    // UpdateServiceBookingPolicyUseCase/UpdateServiceResourceRequirementsUseCase write acquires
    // the same row lock, so this request either waits and sees the committed update or the other
    // write waits for this transaction, never a stale eligibility/policy read.
    const schedule = await this.txManager.run(async () => {
      // Lock order: the service, then every considered resource in one call, then the cap check —
      // the resource lock is what makes the per-resource cap count safe against a concurrent
      // request for another service that picks the same resource.
      await this.tenantLock.lockService(input.tenantId, input.serviceId);
      const prepared = await this.prepareRequest(input, customerId);
      const considered = await this.resolveAndLock(input, prepared);
      await assertUnderCap(this.scheduleRepo, {
        tenantId: input.tenantId,
        serviceId: input.serviceId,
        assignmentPolicy: prepared.assignmentPolicy,
        resourceIds: prepared.resourceAssignments.map((assignment) => assignment.resourceId),
      });
      const resourcePlan = await this.checkPatternConflict(input, prepared, considered);
      const built = buildRequestedSchedule(input, customerId, prepared);
      await this.scheduleRepo.save(built);
      // An AUTO_CONFIRM schedule is ACTIVE from the start, so its whole term becomes bookings in
      // this same transaction (UC-070 step 3); a PENDING_APPROVAL one waits for UC-071.
      if (built.status === 'ACTIVE') await this.materialize(built, prepared, resourcePlan);
      return built;
    });

    return {
      id: schedule.id,
      status: schedule.status as 'ACTIVE' | 'PENDING_APPROVAL',
      approvalHoldExpiresAt: schedule.approvalHoldExpiresAt?.toISOString() ?? null,
    };
  }

  // Everything derivable from the service/policy alone, independent of who the customer is —
  // split out purely to keep execute() under docs/CODE_STANDARDS.md's function-length limit.
  // Must be called from inside the same transaction as lockForCapCheck() — findByIdForUpdate()
  // requires an active transaction and is what closes the stale-eligibility race described above.
  private async prepareRequest(
    input: RequestRecurringBookingScheduleUseCaseInput,
    customerId: string,
  ): Promise<PreparedRecurringBookingScheduleRequest> {
    const service = await this.serviceRepo.findByIdForUpdate(input.serviceId, input.tenantId);
    if (!service) throw new BookingServiceNotInTenantError(input.serviceId);
    assertServiceEligible(service);

    const autoApproveEnabled = await this.bookingPlatform.getAutoApproveEnabled(input.tenantId);
    const policy = resolveApprovalMode(service.bookingPolicy, autoApproveEnabled);
    const { status, approvalHoldExpiresAt } = resolveApprovalStatus(policy);

    // The term is validated before it is enumerated, so a far-future endsOn is refused without
    // any per-occurrence work (M23-S18: a schedule is a fixed term, never open-ended).
    const maxTermDays = policy.recurringHorizonDays ?? DEFAULT_RECURRING_HORIZON_DAYS;
    assertValidTerm(input.startsOn, input.endsOn, maxTermDays);
    const occurrences = await resolveStartableOccurrences(this.scheduleRepo, {
      input,
      customerId,
      service,
    });
    const resourceAssignments = buildResourceAssignments(
      pickCustomerChoices(effectiveRequirements(service), input.resourceSelections),
    );

    return {
      service,
      maxTermDays,
      occurrences,
      assignmentPolicy: deriveAssignmentPolicy(service),
      resourceAssignments,
      status,
      approvalHoldExpiresAt,
    };
  }

  private get conflictDeps(): ConflictCheckDeps {
    return {
      resourceRepo: this.resourceRepo,
      availabilityService: this.availabilityService,
      occupancyRepo: this.occupancyRepo,
      closureRepo: this.closureRepo,
      openingRepo: this.openingRepo,
      tenantLock: this.tenantLock,
    };
  }

  // Resolves the resources that decide every requirement and locks them all in one call, before the
  // cap is read (see execute()).
  private resolveAndLock(
    input: RequestRecurringBookingScheduleUseCaseInput,
    prepared: PreparedRecurringBookingScheduleRequest,
  ): Promise<ConsideredRequirement[]> {
    return resolveAndLockConsidered(this.conflictDeps, {
      tenantId: input.tenantId,
      timezone: input.timezone,
      service: prepared.service,
      selections: input.resourceSelections,
      firstOccurrenceStart: prepared.occurrences[0].occurrenceStart,
    });
  }

  private async checkPatternConflict(
    input: RequestRecurringBookingScheduleUseCaseInput,
    prepared: PreparedRecurringBookingScheduleRequest,
    considered: ConsideredRequirement[],
  ): Promise<Resource[][]> {
    const { businessHours } = await this.bookingPlatform.getBusinessHoursAndLocale(input.tenantId);
    return assertPatternConflictFree(
      this.conflictDeps,
      {
        tenantId: input.tenantId,
        timezone: input.timezone,
        businessHours,
        recurrence: input.recurrence,
        service: prepared.service,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        occurrences: prepared.occurrences,
      },
      considered,
    );
  }

  private async materialize(
    schedule: RecurringBookingSchedule,
    prepared: PreparedRecurringBookingScheduleRequest,
    resources: Resource[][],
  ): Promise<void> {
    await materializeRecurringScheduleOccurrences(
      {
        bookingRepo: this.bookingRepo,
        customerPort: this.customerPort,
        occupancyRepo: this.occupancyRepo,
        availabilityService: this.availabilityService,
      },
      {
        schedule,
        service: prepared.service,
        occurrences: prepared.occurrences,
        resources,
        approvedByStaffId: null,
      },
    );
  }
}
