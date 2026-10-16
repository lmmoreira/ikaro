import { Inject, Injectable } from '@nestjs/common';
import { RecurringBookingScheduleNotFoundError } from '../../domain/errors/recurring-booking-schedule.error';
import {
  IRecurringBookingScheduleRepository,
  RECURRING_BOOKING_SCHEDULE_REPOSITORY,
} from '../ports/recurring-booking-schedule-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { RecurringScheduleRenewalService } from '../services/recurring-schedule-renewal.service';
import {
  RecurringBookingScheduleResult,
  loadPickedResourceNames,
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
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    private readonly renewalService: RecurringScheduleRenewalService,
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
    const renewableIds = await this.renewalService.findRenewableIds(input.tenantId, [schedule]);
    // A STAFF|MANAGER read (no customerId) also names the picked resources; a customer read never does.
    const resourceNames =
      input.customerId === undefined
        ? await loadPickedResourceNames(this.resourceRepo, input.tenantId, [schedule])
        : undefined;
    return toRecurringBookingScheduleResult(
      schedule,
      service.name,
      renewableIds.has(schedule.id),
      resourceNames,
    );
  }
}
