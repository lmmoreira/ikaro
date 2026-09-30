import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { BookingServiceNotInTenantError } from '../../domain/errors/booking-domain.error';
import { RecurringBookingScheduleNotFoundError } from '../../domain/errors/recurring-booking-schedule.error';
import {
  enumerateRecurrenceOccurrences,
  RecurrenceOccurrence,
} from '../../domain/recurrence-rule.helpers';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
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
import { materializeRecurringScheduleOccurrences } from './materialize-recurring-schedule-occurrences.helpers';
import { assertPatternConflictFree } from './recurring-booking-schedule-request.helpers';

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

    return this.txManager.run(async () => {
      await this.lockForApproval(initial);
      // Re-read under the lock: the decision is made on what is committed now, and the schedule's
      // version check makes the loser of an approve/reject/expire race fail instead of overwrite.
      const schedule = await this.load(input);
      schedule.approve(input.actorId, input.correlationId);

      const service = await this.serviceRepo.findById(schedule.serviceId, input.tenantId);
      if (!service) throw new BookingServiceNotInTenantError(schedule.serviceId);
      const occurrences = enumerateRecurrenceOccurrences(
        schedule.recurrence,
        schedule.startsOn,
        schedule.endsOn,
        input.timezone,
      );
      await this.assertTermStillHonorable(schedule, service, occurrences, input);

      await this.scheduleRepo.save(schedule);
      const bookingIds = await materializeRecurringScheduleOccurrences(
        {
          bookingRepo: this.bookingRepo,
          customerPort: this.customerPort,
          resourceRepo: this.resourceRepo,
          occupancyRepo: this.occupancyRepo,
          availabilityService: this.availabilityService,
        },
        {
          schedule,
          service,
          occurrences,
          timezone: input.timezone,
          approvedByStaffId: input.actorId,
        },
      );
      return { id: schedule.id, status: 'ACTIVE' as const, occurrenceCount: bookingIds.length };
    });
  }

  private async load(
    input: ApproveRecurringBookingScheduleUseCaseInput,
  ): Promise<RecurringBookingSchedule> {
    const schedule = await this.scheduleRepo.findById(input.scheduleId, input.tenantId);
    if (!schedule) throw new RecurringBookingScheduleNotFoundError(input.scheduleId);
    return schedule;
  }

  // The same lock the request path takes: a chosen resource for FIXED_ASSIGNMENT, the service
  // itself when no resource is known before per-occurrence resolution.
  private async lockForApproval(schedule: RecurringBookingSchedule): Promise<void> {
    if (schedule.assignmentPolicy === 'FIXED_ASSIGNMENT') {
      await this.tenantLock.lockResources(
        schedule.tenantId,
        schedule.resourceAssignments.map((a) => a.resourceId),
      );
    } else {
      await this.tenantLock.lockService(schedule.tenantId, schedule.serviceId);
    }
  }

  private async assertTermStillHonorable(
    schedule: RecurringBookingSchedule,
    service: Service,
    occurrences: RecurrenceOccurrence[],
    input: ApproveRecurringBookingScheduleUseCaseInput,
  ): Promise<void> {
    const { businessHours } = await this.bookingPlatform.getBusinessHoursAndLocale(input.tenantId);
    await assertPatternConflictFree(
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
        assignmentPolicy: schedule.assignmentPolicy,
        resourceIds: schedule.resourceAssignments.map((a) => a.resourceId),
        recurrence: schedule.recurrence,
        service,
        startsOn: schedule.startsOn,
        endsOn: schedule.endsOn,
        occurrences,
      },
    );
  }
}
