import { Inject, Injectable } from '@nestjs/common';
import { todayUTC, utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  AvailabilityRangeInvalidError,
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
import { GetAvailabilitySummaryDto } from '../dtos/get-availability-summary.dto';

export type GetAvailabilitySummaryInput = GetAvailabilitySummaryDto & {
  tenantId: string;
  businessHours: BusinessHours;
  slotGranularityMinutes: 15 | 30 | 60;
  serviceBufferMinutes: number;
  maxBookingAdvanceDays: number;
};

export interface DaySummary {
  date: string;
  available: boolean;
  slotCount: number;
}

export type GetAvailabilitySummaryUseCaseResult = DaySummary[];

@Injectable()
export class GetAvailabilitySummaryUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(SCHEDULE_CLOSURE_REPOSITORY) private readonly closureRepo: IScheduleClosureRepository,
    @Inject(SCHEDULE_OPENING_REPOSITORY) private readonly openingRepo: IScheduleOpeningRepository,
    @Inject(BOOKING_AVAILABILITY_PORT)
    private readonly bookingPort: IBookingAvailabilityPort,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async execute(input: GetAvailabilitySummaryInput): Promise<GetAvailabilitySummaryUseCaseResult> {
    const {
      tenantId,
      businessHours,
      slotGranularityMinutes,
      serviceBufferMinutes,
      maxBookingAdvanceDays,
    } = input;

    if (input.from > input.to) {
      throw new AvailabilityRangeInvalidError('from must not be after to');
    }

    const rangeDays = this.daysBetween(input.from, input.to);
    if (rangeDays > maxBookingAdvanceDays) {
      throw new AvailabilityRangeInvalidError(
        `range exceeds maxBookingAdvanceDays (${maxBookingAdvanceDays})`,
      );
    }

    const services = await this.serviceRepo.findByIds(input.serviceIds, tenantId);
    for (const requestedId of input.serviceIds) {
      const service = services.find((s) => s.id === requestedId);
      if (!service) throw new ServiceNotFoundError(requestedId);
      if (!service.isActive) throw new BookingServiceNotActiveError(requestedId);
    }

    const [closures, openings, bookings] = await Promise.all([
      this.closureRepo.findByTenantAndDateRange(tenantId, input.from, input.to),
      this.openingRepo.findByTenantAndDateRange(tenantId, input.from, input.to),
      this.bookingPort.findApprovedByTenantAndDateRange(tenantId, input.from, input.to),
    ]);

    const today = todayUTC();
    const results: GetAvailabilitySummaryUseCaseResult = [];
    const tz = businessHours.timezone;

    for (const date of this.dateRange(input.from, input.to)) {
      if (date < today) {
        results.push({ date, available: false, slotCount: 0 });
        continue;
      }

      const dayClosures = closures.filter((c) => c.date === date);
      const dayOpening = openings.find((o) => o.date === date) ?? null;
      const dayBookings = bookings.filter((b) => utcDateToLocalDate(b.scheduledAt, tz) === date);

      const slots = this.availabilityService.calculate({
        date,
        services: services.map((s) => ({ durationMinutes: s.durationMinutes })),
        businessHours,
        slotGranularityMinutes,
        serviceBufferMinutes,
        closures: dayClosures,
        opening: dayOpening,
        existingBookings: dayBookings,
      });

      results.push({ date, available: slots.length > 0, slotCount: slots.length });
    }

    return results;
  }

  private *dateRange(from: string, to: string): Generator<string> {
    const cursor = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    while (cursor <= end) {
      yield cursor.toISOString().slice(0, 10);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  private daysBetween(from: string, to: string): number {
    const msPerDay = 86_400_000;
    return (
      (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / msPerDay
    );
  }
}
