import { Inject, Injectable } from '@nestjs/common';
import { todayUTC, utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Resource } from '../../domain/resource.aggregate';
import {
  AvailabilityRangeInvalidError,
  BookingServiceNotActiveError,
  ServiceNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { ResourceNotActiveError, ResourceNotFoundError } from '../../domain/errors/resource.error';
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
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { GetAvailabilitySummaryDto } from '../dtos/get-availability-summary.dto';

export type GetAvailabilitySummaryUseCaseInput = GetAvailabilitySummaryDto & {
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
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(BOOKING_AVAILABILITY_PORT)
    private readonly bookingPort: IBookingAvailabilityPort,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async execute(
    input: GetAvailabilitySummaryUseCaseInput,
  ): Promise<GetAvailabilitySummaryUseCaseResult> {
    const {
      tenantId,
      businessHours,
      slotGranularityMinutes,
      serviceBufferMinutes,
      maxBookingAdvanceDays,
    } = input;

    this.validateRange(input.from, input.to, maxBookingAdvanceDays);
    const services = await this.findAndValidateServices(input.serviceIds, tenantId);
    const [resource, scheduleRange, bookings] = await Promise.all([
      this.findResource(tenantId, input.resourceId),
      this.loadScheduleRange(tenantId, input.from, input.to, input.resourceId),
      this.bookingPort.findApprovedByTenantAndDateRange(tenantId, input.from, input.to),
    ]);

    return this.buildDaySummaries(input, {
      services,
      resource,
      ...scheduleRange,
      bookings,
      businessHours,
      slotGranularityMinutes,
      serviceBufferMinutes,
    });
  }

  private async findResource(
    tenantId: string,
    resourceId: string | undefined,
  ): Promise<Resource | null> {
    if (resourceId == null) return null;
    const resource = await this.resourceRepo.findById(resourceId, tenantId);
    if (!resource) throw new ResourceNotFoundError(resourceId);
    if (!resource.isActive) throw new ResourceNotActiveError(resourceId);
    return resource;
  }

  // Combines tenant-wide rows (always fetched) with resource-scoped rows (fetched only when
  // resourceId is set) — both apply to a resource-scoped availability check.
  private async loadScheduleRange(
    tenantId: string,
    from: string,
    to: string,
    resourceId: string | undefined,
  ): Promise<{
    closures: Awaited<ReturnType<IScheduleClosureRepository['findByTenantAndDateRange']>>;
    tenantOpenings: Awaited<ReturnType<IScheduleOpeningRepository['findByTenantAndDateRange']>>;
    resourceOpenings: Awaited<ReturnType<IScheduleOpeningRepository['findByTenantAndDateRange']>>;
  }> {
    const [tenantClosures, resourceClosures, tenantOpenings, resourceOpenings] = await Promise.all([
      this.closureRepo.findByTenantAndDateRange(tenantId, from, to),
      resourceId != null
        ? this.closureRepo.findByTenantAndDateRange(tenantId, from, to, resourceId)
        : Promise.resolve([]),
      this.openingRepo.findByTenantAndDateRange(tenantId, from, to),
      resourceId != null
        ? this.openingRepo.findByTenantAndDateRange(tenantId, from, to, resourceId)
        : Promise.resolve([]),
    ]);
    return {
      closures: [...tenantClosures, ...resourceClosures],
      tenantOpenings,
      resourceOpenings,
    };
  }

  private validateRange(from: string, to: string, maxBookingAdvanceDays: number): void {
    if (from > to) {
      throw new AvailabilityRangeInvalidError('from must not be after to');
    }
    if (this.daysBetween(from, to) > maxBookingAdvanceDays) {
      throw new AvailabilityRangeInvalidError(
        `range exceeds maxBookingAdvanceDays (${maxBookingAdvanceDays})`,
      );
    }
  }

  private async findAndValidateServices(serviceIds: string[], tenantId: string) {
    const services = await this.serviceRepo.findByIds(serviceIds, tenantId);
    for (const requestedId of serviceIds) {
      const service = services.find((s) => s.id === requestedId);
      if (!service) throw new ServiceNotFoundError(requestedId);
      if (!service.isActive) throw new BookingServiceNotActiveError(requestedId);
    }
    return services;
  }

  private buildDaySummaries(
    input: GetAvailabilitySummaryUseCaseInput,
    ctx: {
      services: Awaited<ReturnType<IServiceRepository['findByIds']>>;
      resource: Resource | null;
      closures: Awaited<ReturnType<IScheduleClosureRepository['findByTenantAndDateRange']>>;
      tenantOpenings: Awaited<ReturnType<IScheduleOpeningRepository['findByTenantAndDateRange']>>;
      resourceOpenings: Awaited<ReturnType<IScheduleOpeningRepository['findByTenantAndDateRange']>>;
      bookings: Awaited<ReturnType<IBookingAvailabilityPort['findApprovedByTenantAndDateRange']>>;
      businessHours: BusinessHours;
      slotGranularityMinutes: 15 | 30 | 60;
      serviceBufferMinutes: number;
    },
  ): GetAvailabilitySummaryUseCaseResult {
    const today = todayUTC();
    const results: GetAvailabilitySummaryUseCaseResult = [];

    for (const date of this.dateRange(input.from, input.to)) {
      if (date < today) {
        results.push({ date, available: false, slotCount: 0 });
        continue;
      }
      const slots = this.calculateSlotsForDate(date, ctx);
      results.push({ date, available: slots.length > 0, slotCount: slots.length });
    }

    return results;
  }

  private calculateSlotsForDate(
    date: string,
    ctx: {
      services: Awaited<ReturnType<IServiceRepository['findByIds']>>;
      resource: Resource | null;
      closures: Awaited<ReturnType<IScheduleClosureRepository['findByTenantAndDateRange']>>;
      tenantOpenings: Awaited<ReturnType<IScheduleOpeningRepository['findByTenantAndDateRange']>>;
      resourceOpenings: Awaited<ReturnType<IScheduleOpeningRepository['findByTenantAndDateRange']>>;
      bookings: Awaited<ReturnType<IBookingAvailabilityPort['findApprovedByTenantAndDateRange']>>;
      businessHours: BusinessHours;
      slotGranularityMinutes: 15 | 30 | 60;
      serviceBufferMinutes: number;
    },
  ) {
    const tz = ctx.businessHours.timezone;
    const dayClosures = ctx.closures.filter((c) => c.date === date);
    const dayTenantOpening = ctx.tenantOpenings.find((o) => o.date === date) ?? null;
    const dayResourceOpening = ctx.resourceOpenings.find((o) => o.date === date) ?? null;
    const dayBookings = ctx.bookings.filter((b) => utcDateToLocalDate(b.scheduledAt, tz) === date);

    return this.availabilityService.calculate({
      date,
      services: ctx.services.map((s) => ({ durationMinutes: s.durationMinutes })),
      businessHours: ctx.businessHours,
      resource: ctx.resource,
      slotGranularityMinutes: ctx.slotGranularityMinutes,
      serviceBufferMinutes: ctx.serviceBufferMinutes,
      closures: dayClosures,
      opening: dayTenantOpening,
      resourceOpening: dayResourceOpening,
      existingBookings: dayBookings,
    });
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
