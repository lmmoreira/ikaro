import { Inject, Injectable } from '@nestjs/common';
import { todayUTC, utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { RequestContext } from '../../../../shared/request/request-context';
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  AvailabilityRangeInvalidError,
  BookingDomainError,
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

export interface DaySummary {
  date: string;
  available: boolean;
  slotCount: number;
}

export type GetAvailabilitySummaryUseCaseResult = DaySummary[];

@Injectable()
export class GetAvailabilitySummaryUseCase {
  constructor(
    private readonly tenantContext: RequestContext,
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(SCHEDULE_CLOSURE_REPOSITORY) private readonly closureRepo: IScheduleClosureRepository,
    @Inject(SCHEDULE_OPENING_REPOSITORY) private readonly openingRepo: IScheduleOpeningRepository,
    @Inject(BOOKING_AVAILABILITY_PORT)
    private readonly bookingPort: IBookingAvailabilityPort,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async execute(dto: GetAvailabilitySummaryDto): Promise<GetAvailabilitySummaryUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;

    if (dto.from > dto.to) {
      throw new AvailabilityRangeInvalidError('from must not be after to');
    }

    const { businessHours, booking: bookingSettings } = this.tenantContext.settings;

    const rangeDays = this.daysBetween(dto.from, dto.to);
    if (rangeDays > bookingSettings.maxBookingAdvanceDays) {
      throw new AvailabilityRangeInvalidError(
        `range exceeds maxBookingAdvanceDays (${bookingSettings.maxBookingAdvanceDays})`,
      );
    }

    const services = await this.serviceRepo.findByIds(dto.serviceIds, tenantId);
    for (const requestedId of dto.serviceIds) {
      const service = services.find((s) => s.id === requestedId);
      if (!service) throw new BookingDomainError(`Service not found: ${requestedId}`);
      if (!service.isActive) throw new BookingDomainError(`Service is not active: ${requestedId}`);
    }

    const [closures, openings, bookings] = await Promise.all([
      this.closureRepo.findByTenantAndDateRange(tenantId, dto.from, dto.to),
      this.openingRepo.findByTenantAndDateRange(tenantId, dto.from, dto.to),
      this.bookingPort.findApprovedByTenantAndDateRange(tenantId, dto.from, dto.to),
    ]);

    const today = todayUTC();
    const results: GetAvailabilitySummaryUseCaseResult = [];
    const tz = businessHours.timezone;

    for (const date of this.dateRange(dto.from, dto.to)) {
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
        slotGranularityMinutes: bookingSettings.slotGranularityMinutes,
        serviceBufferMinutes: bookingSettings.serviceBufferMinutes,
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
