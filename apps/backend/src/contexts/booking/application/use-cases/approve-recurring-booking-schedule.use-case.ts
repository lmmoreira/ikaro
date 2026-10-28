import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  BookingScheduledInPastError,
  BookingServiceNotInTenantError,
} from '../../domain/errors/booking-domain.error';
import {
  RecurringBookingScheduleIneligibleServiceError,
  RecurringBookingScheduleNotFoundError,
} from '../../domain/errors/recurring-booking-schedule.error';
import {
  enumerateRecurrenceOccurrences,
  RecurrenceOccurrence,
} from '../../domain/recurrence-rule.helpers';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Resource } from '../../domain/resource.aggregate';
import { Service } from '../../domain/service.aggregate';
import { BOOKING_CUSTOMER_PORT, IBookingCustomerPort } from '../ports/booking-customer.port';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
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
import {
  MaterializeOccurrencesParams,
  materializeRecurringScheduleOccurrences,
} from './materialize-recurring-schedule-occurrences.helpers';
import { assertServiceEligible } from './recurring-booking-schedule-eligibility.helpers';
import {
  assertPatternConflictFree,
  ConflictCheckDeps,
} from './recurring-booking-schedule-request.helpers';
import { resolveAndLockConsidered } from './recurring-considered-resources.helpers';
import { deriveAssignmentPolicy } from './recurring-service-requirement.helpers';
import { dropPastOccurrences } from './recurring-booking-schedule-window.helpers';

export interface ApproveRecurringBookingScheduleUseCaseInput {
  scheduleId: string;
  tenantId: string;
  correlationId: string;
  timezone: string;
  // The approving staff member (a STAFF or MANAGER actor).
  actorId: string;
}

export interface ApproveRecurringBookingScheduleUseCaseResult {
  id: string;
  status: 'ACTIVE';
  occurrenceCount: number;
}

// UC-071 (approve). Atomic like creation: the whole term is checked again under the same lock,
// and one occurrence that no longer passes refuses the approval as a whole (409, nothing created,
// the request stays PENDING_APPROVAL). A UC-073 worklist entry can only point at an existing
// booking, and no occurrence was created, so none is raised here.
@Injectable()
export class ApproveRecurringBookingScheduleUseCase {
  constructor(
    @Inject(RECURRING_BOOKING_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IRecurringBookingScheduleRepository,
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(BOOKING_CUSTOMER_PORT) private readonly customerPort: IBookingCustomerPort,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(SCHEDULE_CLOSURE_REPOSITORY) private readonly closureRepo: IScheduleClosureRepository,
    @Inject(SCHEDULE_OPENING_REPOSITORY) private readonly openingRepo: IScheduleOpeningRepository,
    @Inject(BOOKING_PLATFORM_PORT) private readonly bookingPlatform: IBookingPlatformPort,
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async execute(
    input: ApproveRecurringBookingScheduleUseCaseInput,
  ): Promise<ApproveRecurringBookingScheduleUseCaseResult> {
    const initial = await this.load(input);
    const tenantServiceBufferMinutes = await this.bookingPlatform.getServiceBufferMinutes(
      input.tenantId,
    );

    return this.txManager.run(async () => {
      await this.lockForApproval(initial);
      // Re-read under the lock: the decision is made on what is committed now, and the schedule's
      // version check makes the loser of an approve/reject/expire race fail instead of overwrite.
      const schedule = await this.load(input);
      schedule.approve(input.actorId, input.correlationId);

      const service = await this.serviceRepo.findById(schedule.serviceId, input.tenantId);
      if (!service) throw new BookingServiceNotInTenantError(schedule.serviceId);
      // M23-S35 — occurrences that started while the request waited are never booked. They are
      // dropped before the conflict check, so a past slot on a since-closed day cannot refuse the
      // whole approval, and the resource plan stays aligned with what is materialized. The booking
      // window is not re-checked: the manager's decision is theirs.
      const occurrences = dropPastOccurrences(
        enumerateRecurrenceOccurrences(
          schedule.recurrence,
          schedule.startsOn,
          schedule.endsOn,
          input.timezone,
        ),
        new Date(),
      );
      if (occurrences.length === 0) throw new BookingScheduledInPastError();
      const resources = await this.assertTermStillHonorable(
        schedule,
        service,
        occurrences,
        input,
        tenantServiceBufferMinutes,
      );

      await this.scheduleRepo.save(schedule);
      const bookingIds = await this.materialize(
        { schedule, service, occurrences, resources, tenantServiceBufferMinutes },
        input.actorId,
      );
      return { id: schedule.id, status: 'ACTIVE' as const, occurrenceCount: bookingIds.length };
    });
  }

  private materialize(
    term: Omit<MaterializeOccurrencesParams, 'approvedByStaffId'>,
    approvedByStaffId: string,
  ): Promise<string[]> {
    return materializeRecurringScheduleOccurrences(
      {
        bookingRepo: this.bookingRepo,
        customerPort: this.customerPort,
        occupancyRepo: this.occupancyRepo,
        availabilityService: this.availabilityService,
      },
      { ...term, approvedByStaffId },
    );
  }

  private async load(
    input: ApproveRecurringBookingScheduleUseCaseInput,
  ): Promise<RecurringBookingSchedule> {
    const schedule = await this.scheduleRepo.findById(input.scheduleId, input.tenantId);
    if (!schedule) throw new RecurringBookingScheduleNotFoundError(input.scheduleId);
    return schedule;
  }

  // The same first lock the request path takes (then the considered resources, in
  // assertTermStillHonorable()).
  private async lockForApproval(schedule: RecurringBookingSchedule): Promise<void> {
    await this.tenantLock.lockService(schedule.tenantId, schedule.serviceId);
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

  // The service is read as it is now, not as it was at request time, so an edit made while the
  // request waited is caught here: a service that no longer qualifies, or whose requirements no
  // longer yield the policy the schedule was accepted under, refuses the approval (TD49 Story 0).
  private async assertTermStillHonorable(
    schedule: RecurringBookingSchedule,
    service: Service,
    occurrences: RecurrenceOccurrence[],
    input: ApproveRecurringBookingScheduleUseCaseInput,
    tenantServiceBufferMinutes: number,
  ): Promise<Resource[][]> {
    assertServiceEligible(service);
    if (deriveAssignmentPolicy(service) !== schedule.assignmentPolicy) {
      throw new RecurringBookingScheduleIneligibleServiceError('selection-mode-mismatch');
    }
    const considered = await resolveAndLockConsidered(this.conflictDeps, {
      tenantId: input.tenantId,
      timezone: input.timezone,
      service,
      selections: schedule.resourceAssignments.map((a) => ({
        resourceType: a.resourceType,
        resourceId: a.resourceId,
      })),
      firstOccurrenceStart: occurrences[0].occurrenceStart,
    });
    const { businessHours } = await this.bookingPlatform.getBusinessHoursAndLocale(input.tenantId);
    return assertPatternConflictFree(
      this.conflictDeps,
      {
        tenantId: input.tenantId,
        timezone: input.timezone,
        businessHours,
        tenantServiceBufferMinutes,
        recurrence: schedule.recurrence,
        service,
        startsOn: schedule.startsOn,
        endsOn: schedule.endsOn,
        occurrences,
      },
      considered,
    );
  }
}
