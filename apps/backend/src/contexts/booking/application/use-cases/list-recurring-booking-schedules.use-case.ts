import { Inject, Injectable } from '@nestjs/common';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import {
  IRecurringBookingScheduleRepository,
  RECURRING_BOOKING_SCHEDULE_REPOSITORY,
} from '../ports/recurring-booking-schedule-repository.port';

export interface ListRecurringBookingSchedulesUseCaseInput {
  tenantId: string;
  // undefined → all schedules for the tenant (STAFF|MANAGER, approval queue); set → only that
  // customer's own schedules.
  customerId?: string;
}

export interface RecurringBookingScheduleListItem {
  id: string;
  customerId: string;
  serviceId: string;
  recurrence: RecurringBookingSchedule['recurrence'];
  startsOn: string;
  endsOn: string | null;
  status: RecurringBookingSchedule['status'];
  assignmentPolicy: RecurringBookingSchedule['assignmentPolicy'];
  approvalHoldExpiresAt: string | null;
}

export interface ListRecurringBookingSchedulesUseCaseResult {
  items: RecurringBookingScheduleListItem[];
}

@Injectable()
export class ListRecurringBookingSchedulesUseCase {
  constructor(
    @Inject(RECURRING_BOOKING_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IRecurringBookingScheduleRepository,
  ) {}

  async execute(
    input: ListRecurringBookingSchedulesUseCaseInput,
  ): Promise<ListRecurringBookingSchedulesUseCaseResult> {
    const schedules = await this.scheduleRepo.findAllByTenant(input.tenantId, {
      customerId: input.customerId,
    });
    return {
      items: schedules.map((s) => ({
        id: s.id,
        customerId: s.customerId,
        serviceId: s.serviceId,
        recurrence: s.recurrence,
        startsOn: s.startsOn,
        endsOn: s.endsOn,
        status: s.status,
        assignmentPolicy: s.assignmentPolicy,
        approvalHoldExpiresAt: s.approvalHoldExpiresAt?.toISOString() ?? null,
      })),
    };
  }
}
