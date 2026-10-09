import { Inject, Injectable } from '@nestjs/common';
import { ListRecurringBookingSchedulesDto } from '../dtos/list-recurring-booking-schedules.dto';
import {
  IRecurringBookingScheduleRepository,
  RECURRING_BOOKING_SCHEDULE_REPOSITORY,
} from '../ports/recurring-booking-schedule-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import {
  RecurringBookingScheduleResult,
  toRecurringBookingScheduleResult,
} from './recurring-booking-schedule-result.helpers';

export type ListRecurringBookingSchedulesUseCaseInput = ListRecurringBookingSchedulesDto & {
  tenantId: string;
  // undefined → all schedules for the tenant (STAFF|MANAGER, approval queue); set → only that
  // customer's own schedules.
  customerId?: string;
};

export interface ListRecurringBookingSchedulesUseCaseResult {
  items: RecurringBookingScheduleResult[];
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
}

@Injectable()
export class ListRecurringBookingSchedulesUseCase {
  constructor(
    @Inject(RECURRING_BOOKING_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IRecurringBookingScheduleRepository,
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
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
    // One tenant-scoped read for the whole page, never one per row. Every schedule's service
    // exists: the composite FK (tenant_id, service_id) guarantees it, and findByIds does not
    // filter inactive services, so a missing name is a broken invariant, not a case to handle.
    const services = await this.serviceRepo.findByIds(
      [...new Set(items.map((s) => s.serviceId))],
      input.tenantId,
    );
    const nameById = new Map(services.map((svc) => [svc.id, svc.name]));
    return {
      items: items.map((s) => {
        const serviceName = nameById.get(s.serviceId);
        if (serviceName === undefined) {
          throw new Error(`Service ${s.serviceId} of recurring schedule ${s.id} not found`);
        }
        return toRecurringBookingScheduleResult(s, serviceName);
      }),
      pagination: {
        limit: input.limit,
        offset: input.offset,
        total,
        hasMore: input.offset + input.limit < total,
      },
    };
  }
}
