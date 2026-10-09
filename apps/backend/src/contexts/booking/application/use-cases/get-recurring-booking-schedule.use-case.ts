import { Inject, Injectable } from '@nestjs/common';
import { RecurringBookingScheduleNotFoundError } from '../../domain/errors/recurring-booking-schedule.error';
import {
  IRecurringBookingScheduleRepository,
  RECURRING_BOOKING_SCHEDULE_REPOSITORY,
} from '../ports/recurring-booking-schedule-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import {
  RecurringBookingScheduleResult,
  toRecurringBookingScheduleResult,
} from './recurring-booking-schedule-result.helpers';

export interface GetRecurringBookingScheduleUseCaseInput {
  scheduleId: string;
  tenantId: string;
  // undefined → any schedule of the tenant (STAFF|MANAGER); set → only that customer's own.
  customerId?: string;
}

export type GetRecurringBookingScheduleUseCaseResult = RecurringBookingScheduleResult;

// UC-070 / UC-071: one schedule, in the same shape as a list item. A foreign customer's schedule
// reads as not found, exactly like another tenant's — a read must not reveal that it exists
// (the mutating routes keep their 403 through assertScheduleOwnership).
@Injectable()
export class GetRecurringBookingScheduleUseCase {
  constructor(
    @Inject(RECURRING_BOOKING_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IRecurringBookingScheduleRepository,
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
  ) {}

  async execute(
    input: GetRecurringBookingScheduleUseCaseInput,
  ): Promise<GetRecurringBookingScheduleUseCaseResult> {
    const schedule = await this.scheduleRepo.findById(input.scheduleId, input.tenantId);
    if (!schedule || (input.customerId !== undefined && schedule.customerId !== input.customerId)) {
      throw new RecurringBookingScheduleNotFoundError(input.scheduleId);
    }
    // The composite FK (tenant_id, service_id) guarantees the service exists.
    const service = await this.serviceRepo.findById(schedule.serviceId, input.tenantId);
    if (!service) {
      throw new Error(
        `Service ${schedule.serviceId} of recurring schedule ${schedule.id} not found`,
      );
    }
    return toRecurringBookingScheduleResult(schedule, service.name);
  }
}
