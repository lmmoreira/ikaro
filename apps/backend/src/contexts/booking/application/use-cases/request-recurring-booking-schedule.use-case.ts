import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  BookingCustomerNotFoundError,
  BookingServiceNotInTenantError,
} from '../../domain/errors/booking-domain.error';
import { RecurringBookingScheduleCapReachedError } from '../../domain/errors/recurring-booking-schedule.error';
import {
  RecurringBookingSchedule,
  RequestRecurringBookingScheduleResourceAssignmentInput,
} from '../../domain/recurring-booking-schedule.aggregate';
import {
  DEFAULT_RECURRING_HORIZON_DAYS,
  enumerateRecurrenceOccurrences,
  RecurrenceRule,
  resolveHorizonEndDate,
} from '../../domain/recurrence-rule.helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import { BOOKING_CUSTOMER_PORT, IBookingCustomerPort } from '../ports/booking-customer.port';
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
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { resolveApprovalMode } from './service-result.mapper';
import {
  assertPatternConflictFree,
  assertServiceEligible,
  buildResourceAssignments,
  resolveApprovalStatus,
} from './recurring-booking-schedule-request.helpers';

// App-enforced caps (docs/02-DOMAIN_MODEL.md § RecurringBookingSchedule), not DB constraints.
const MAX_ACTIVE_SCHEDULES_PER_RESOURCE = 50;
const MAX_ACTIVE_RESOLVE_PER_OCCURRENCE_SCHEDULES_PER_SERVICE = 50;

interface PreparedRecurringBookingScheduleRequest {
  service: Service;
  occurrences: { occurrenceStart: Date }[];
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
  endsOn: string | null;
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
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(BOOKING_CUSTOMER_PORT) private readonly customerPort: IBookingCustomerPort,
    @Inject(BOOKING_STAFF_PORT) private readonly staffPort: IBookingStaffPort,
    @Inject(BOOKING_PLATFORM_PORT) private readonly bookingPlatform: IBookingPlatformPort,
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly availabilityService: AvailabilityService,
    private readonly slotConflictService: BookingSlotConflictService,
  ) {}

  async execute(
    input: RequestRecurringBookingScheduleUseCaseInput,
  ): Promise<RequestRecurringBookingScheduleUseCaseResult> {
    const customerId = await this.resolveCustomerId(input);
    const prepared = await this.prepareRequest(input);

    // The save() call below must stay textually inside this callback — architecture-check's
    // transactional-save detector requires save() to be lexically nested in the
    // ITransactionManager.run() callback, not merely reachable through a helper method
    // (docs/ENGINEERING_RULES_BACKEND.md § architecture-check's transactional-save detector).
    const schedule = await this.txManager.run(async () => {
      await this.lockForCapCheck(input);
      await this.assertUnderCap(input);
      await this.checkPatternConflict(input, prepared);
      const built = this.buildSchedule(input, customerId, prepared);
      await this.scheduleRepo.save(built);
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
  private async prepareRequest(
    input: RequestRecurringBookingScheduleUseCaseInput,
  ): Promise<PreparedRecurringBookingScheduleRequest> {
    const service = await this.serviceRepo.findById(input.serviceId, input.tenantId);
    if (!service) throw new BookingServiceNotInTenantError(input.serviceId);
    assertServiceEligible(service, input.assignmentPolicy);

    const autoApproveEnabled = await this.bookingPlatform.getAutoApproveEnabled(input.tenantId);
    const policy = resolveApprovalMode(service.bookingPolicy, autoApproveEnabled);
    const { status, approvalHoldExpiresAt } = resolveApprovalStatus(policy);

    const horizonEnd = resolveHorizonEndDate(
      input.startsOn,
      policy.recurringHorizonDays ?? DEFAULT_RECURRING_HORIZON_DAYS,
    );
    const occurrences = enumerateRecurrenceOccurrences(
      input.recurrence,
      input.startsOn,
      input.endsOn,
      horizonEnd,
      input.timezone,
    );
    const resourceAssignments = buildResourceAssignments(
      service,
      input.assignmentPolicy,
      input.resourceIds,
    );

    return { service, occurrences, resourceAssignments, status, approvalHoldExpiresAt };
  }

  private async checkPatternConflict(
    input: RequestRecurringBookingScheduleUseCaseInput,
    prepared: PreparedRecurringBookingScheduleRequest,
  ): Promise<void> {
    await assertPatternConflictFree(
      {
        resourceRepo: this.resourceRepo,
        availabilityService: this.availabilityService,
        occupancyRepo: this.occupancyRepo,
        slotConflictService: this.slotConflictService,
      },
      {
        tenantId: input.tenantId,
        serviceId: input.serviceId,
        timezone: input.timezone,
        assignmentPolicy: input.assignmentPolicy,
        resourceIds: input.resourceIds,
        recurrence: input.recurrence,
        service: prepared.service,
        occurrences: prepared.occurrences,
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

  // FIXED_ASSIGNMENT is locked by assertPatternConflictFree()'s own assertSlotFree() call
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

  private async assertUnderCap(input: RequestRecurringBookingScheduleUseCaseInput): Promise<void> {
    if (input.assignmentPolicy === 'FIXED_ASSIGNMENT') {
      for (const resourceId of input.resourceIds) {
        const count = await this.scheduleRepo.countActiveByResource(input.tenantId, resourceId);
        if (count >= MAX_ACTIVE_SCHEDULES_PER_RESOURCE) {
          throw new RecurringBookingScheduleCapReachedError('resource');
        }
      }
    } else {
      const count = await this.scheduleRepo.countActiveResolvePerOccurrenceByService(
        input.tenantId,
        input.serviceId,
      );
      if (count >= MAX_ACTIVE_RESOLVE_PER_OCCURRENCE_SCHEDULES_PER_SERVICE) {
        throw new RecurringBookingScheduleCapReachedError('service');
      }
    }
  }
}
