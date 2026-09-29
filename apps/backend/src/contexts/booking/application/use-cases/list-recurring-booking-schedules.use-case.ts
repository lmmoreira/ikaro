import { Inject, Injectable } from '@nestjs/common';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { ListRecurringBookingSchedulesDto } from '../dtos/list-recurring-booking-schedules.dto';
import {
  IRecurringBookingScheduleRepository,
  RECURRING_BOOKING_SCHEDULE_REPOSITORY,
} from '../ports/recurring-booking-schedule-repository.port';

export type ListRecurringBookingSchedulesUseCaseInput = ListRecurringBookingSchedulesDto & {
  tenantId: string;
  // undefined → all schedules for the tenant (STAFF|MANAGER, approval queue); set → only that
  // customer's own schedules.
  customerId?: string;
};

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
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
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
    const { items, total } = await this.scheduleRepo.findAllByTenantPaginated(input.tenantId, {
      customerId: input.customerId,
      status: input.status,
      limit: input.limit,
      offset: input.offset,
    });
    return {
      items: items.map((s) => ({
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
      pagination: {
        limit: input.limit,
        offset: input.offset,
        total,
        hasMore: input.offset + input.limit < total,
      },
    };
  }
}
