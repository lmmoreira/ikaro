import { Inject, Injectable } from '@nestjs/common';
import { todayUTC } from '../../../../shared/utils/calendar-date';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  AvailabilityDateInPastError,
  BookingServiceNotActiveError,
  ServiceNotFoundError,
} from '../../domain/errors/booking-domain.error';
import {
  IBookingAvailabilityPort,
  BOOKING_AVAILABILITY_PORT,
} from '../ports/booking-availability.port';
import {
  IScheduleClosureRepository,
  SCHEDULE_CLOSURE_REPOSITORY,
} from '../ports/schedule-closure-repository.port';
import {
  IScheduleOpeningRepository,
  SCHEDULE_OPENING_REPOSITORY,
} from '../ports/schedule-opening-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { GetAvailabilityDto } from '../dtos/get-availability.dto';

export type GetAvailabilityInput = GetAvailabilityDto & {
  tenantId: string;
  businessHours: BusinessHours;
  slotGranularityMinutes: 15 | 30 | 60;
  serviceBufferMinutes: number;
};

export interface AvailableSlotResult {
  startsAt: string;
  endsAt: string;
}

export interface GetAvailabilityUseCaseResult {
  date: string;
  slots: AvailableSlotResult[];
  available: boolean;
}

@Injectable()
export class GetAvailabilityUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(SCHEDULE_CLOSURE_REPOSITORY) private readonly closureRepo: IScheduleClosureRepository,
    @Inject(SCHEDULE_OPENING_REPOSITORY) private readonly openingRepo: IScheduleOpeningRepository,
    @Inject(BOOKING_AVAILABILITY_PORT)
    private readonly bookingPort: IBookingAvailabilityPort,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async execute(input: GetAvailabilityInput): Promise<GetAvailabilityUseCaseResult> {
    const { tenantId, businessHours, slotGranularityMinutes, serviceBufferMinutes } = input;

    const today = todayUTC();
    if (input.date < today) throw new AvailabilityDateInPastError();

    const services = await this.serviceRepo.findByIds(input.serviceIds, tenantId);

    for (const requestedId of input.serviceIds) {
      const service = services.find((s) => s.id === requestedId);
      if (!service) {
        throw new ServiceNotFoundError(requestedId);
      }
      if (!service.isActive) {
        throw new BookingServiceNotActiveError(requestedId);
      }
    }

    const [closures, opening, existingBookings] = await Promise.all([
      this.closureRepo.findByTenantAndDate(tenantId, input.date),
      this.openingRepo.findByTenantAndDate(tenantId, input.date),
      this.bookingPort.findApprovedByTenantAndDate(tenantId, input.date),
    ]);

    const slots = this.availabilityService.calculate({
      date: input.date,
      services: services.map((s) => ({ durationMinutes: s.durationMinutes })),
      businessHours,
      slotGranularityMinutes,
      serviceBufferMinutes,
      closures,
      opening: opening ?? null,
      existingBookings,
    });

    return { date: input.date, slots, available: slots.length > 0 };
  }
}
