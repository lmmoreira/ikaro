import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  BookingCustomerNotFoundError,
  BookingServiceNotInTenantError,
} from '../../domain/errors/booking-domain.error';
import {
  RecurringBookingSchedule,
  RequestRecurringBookingScheduleResourceAssignmentInput,
} from '../../domain/recurring-booking-schedule.aggregate';
import {
  assertValidTerm,
  DEFAULT_RECURRING_HORIZON_DAYS,
  enumerateRecurrenceOccurrences,
  RecurrenceOccurrence,
  RecurrenceRule,
} from '../../domain/recurrence-rule.helpers';
import { Resource } from '../../domain/resource.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import { BOOKING_CUSTOMER_PORT, IBookingCustomerPort } from '../ports/booking-customer.port';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
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
  assertPatternConflictFree,
  assertServiceEligible,
  buildResourceAssignments,
  resolveApprovalStatus,
} from './recurring-booking-schedule-request.helpers';

interface PreparedRecurringBookingScheduleRequest {
  service: Service;
  // The service's maximum term in days — validated against endsOn in prepareRequest() and passed
  // on to the aggregate, which enforces the same invariant.
  maxTermDays: number;
  occurrences: RecurrenceOccurrence[];
  resourceAssignments: RequestRecurringBookingScheduleResourceAssignmentInput[];
  status: 'ACTIVE' | 'PENDING_APPROVAL';
  approvalHoldExpiresAt: Date | null;
}

export interface RequestRecurringBookingScheduleUseCaseInput {
  tenantId: string;
  correlationId: string;
  timezone: string;
  serviceId: string;
  recurrence: RecurrenceRule;
  startsOn: string;
  endsOn: string;
  assignmentPolicy: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE';
  resourceIds: string[];
  actorType: 'CUSTOMER' | 'STAFF';
  actorId: string;
  // Present only when a STAFF actor creates on the customer's behalf.
  bodyCustomerId?: string;
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
    const customerId = await this.resolveCustomerId(input);

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
      await this.lockForCapCheck(input);
      const prepared = await this.prepareRequest(input);
      await assertUnderCap(this.scheduleRepo, input);
      const resourcePlan = await this.checkPatternConflict(input, prepared);
      const built = this.buildSchedule(input, customerId, prepared);
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
  ): Promise<PreparedRecurringBookingScheduleRequest> {
    const service = await this.serviceRepo.findByIdForUpdate(input.serviceId, input.tenantId);
    if (!service) throw new BookingServiceNotInTenantError(input.serviceId);
    assertServiceEligible(service, input.assignmentPolicy);

    const autoApproveEnabled = await this.bookingPlatform.getAutoApproveEnabled(input.tenantId);
    const policy = resolveApprovalMode(service.bookingPolicy, autoApproveEnabled);
    const { status, approvalHoldExpiresAt } = resolveApprovalStatus(policy);

    // The term is validated before it is enumerated, so a far-future endsOn is refused without
    // any per-occurrence work (M23-S18: a schedule is a fixed term, never open-ended).
    const maxTermDays = policy.recurringHorizonDays ?? DEFAULT_RECURRING_HORIZON_DAYS;
    assertValidTerm(input.startsOn, input.endsOn, maxTermDays);
    const occurrences = enumerateRecurrenceOccurrences(
      input.recurrence,
      input.startsOn,
      input.endsOn,
      input.timezone,
    );
    const resourceAssignments = buildResourceAssignments(
      service,
      input.assignmentPolicy,
      input.resourceIds,
    );

    return {
      service,
      maxTermDays,
      occurrences,
      resourceAssignments,
      status,
      approvalHoldExpiresAt,
    };
  }

  private async checkPatternConflict(
    input: RequestRecurringBookingScheduleUseCaseInput,
    prepared: PreparedRecurringBookingScheduleRequest,
  ): Promise<Resource[]> {
    const { businessHours } = await this.bookingPlatform.getBusinessHoursAndLocale(input.tenantId);
    return assertPatternConflictFree(
      {
        resourceRepo: this.resourceRepo,
        availabilityService: this.availabilityService,
        occupancyRepo: this.occupancyRepo,
        closureRepo: this.closureRepo,
        openingRepo: this.openingRepo,
        tenantLock: this.tenantLock,
      },
      {
        tenantId: input.tenantId,
        timezone: input.timezone,
        businessHours,
        assignmentPolicy: input.assignmentPolicy,
        resourceIds: input.resourceIds,
        recurrence: input.recurrence,
        service: prepared.service,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        occurrences: prepared.occurrences,
      },
    );
  }

  private async materialize(
    schedule: RecurringBookingSchedule,
    prepared: PreparedRecurringBookingScheduleRequest,
    resources: Resource[],
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

  private buildSchedule(
    input: RequestRecurringBookingScheduleUseCaseInput,
    customerId: string,
    prepared: PreparedRecurringBookingScheduleRequest,
  ): RecurringBookingSchedule {
    return RecurringBookingSchedule.request({
      tenantId: input.tenantId,
      customerId,
      serviceId: input.serviceId,
      recurrence: input.recurrence,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      maxTermDays: prepared.maxTermDays,
      assignmentPolicy: input.assignmentPolicy,
      resourceAssignments: prepared.resourceAssignments,
      status: prepared.status,
      approvalHoldExpiresAt: prepared.approvalHoldExpiresAt,
      createdByStaffId: input.actorType === 'STAFF' ? input.actorId : null,
      correlationId: input.correlationId,
    });
  }

  private async resolveCustomerId(
    input: RequestRecurringBookingScheduleUseCaseInput,
  ): Promise<string> {
    if (input.actorType === 'CUSTOMER') return input.actorId;

    // STAFF acting on the customer's behalf.
    const staff = await this.staffPort.findActiveById(input.actorId, input.tenantId);
    if (!staff) throw new BookingCustomerNotFoundError(input.actorId);
    const customerId = input.bodyCustomerId;
    if (!customerId) throw new BookingCustomerNotFoundError('missing');
    const customer = await this.customerPort.findById(customerId, input.tenantId);
    if (!customer) throw new BookingCustomerNotFoundError(customerId);
    return customerId;
  }

  // FIXED_ASSIGNMENT is locked by assertPatternConflictFree()'s own lockResources() call
  // (ITenantLockPort.lockResources(), acquired on the caller-chosen resourceIds); RESOLVE_PER_
  // OCCURRENCE has no fixed resource to lock upfront, so it locks on serviceId instead — either
  // lock also protects the cap check below atomically in the same transaction.
  private async lockForCapCheck(input: RequestRecurringBookingScheduleUseCaseInput): Promise<void> {
    if (input.assignmentPolicy === 'FIXED_ASSIGNMENT') {
      await this.tenantLock.lockResources(input.tenantId, input.resourceIds);
    } else {
      await this.tenantLock.lockService(input.tenantId, input.serviceId);
    }
  }
}
