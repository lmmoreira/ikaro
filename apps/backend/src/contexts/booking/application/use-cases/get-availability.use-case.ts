import { Inject, Injectable } from '@nestjs/common';
import { todayUTC } from '../../../../shared/utils/calendar-date';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Resource } from '../../domain/resource.aggregate';
import { ScheduleClosure } from '../../domain/schedule-closure.aggregate';
import { ScheduleOpening } from '../../domain/schedule-opening.aggregate';
import {
  AvailabilityDateInPastError,
  BookingServiceNotActiveError,
  ServiceNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';
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
import { GetAvailabilityDto } from '../dtos/get-availability.dto';

export type GetAvailabilityUseCaseInput = GetAvailabilityDto & {
  tenantId: string;
  businessHours: BusinessHours;
  slotGranularityMinutes: 15 | 30 | 60;
  serviceBufferMinutes: number;
};

interface ScheduleContext {
  resource: Resource | null;
  closures: ScheduleClosure[];
  tenantOpening: ScheduleOpening | null;
  resourceOpening: ScheduleOpening | null;
}

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
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(BOOKING_AVAILABILITY_PORT)
    private readonly bookingPort: IBookingAvailabilityPort,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async execute(input: GetAvailabilityUseCaseInput): Promise<GetAvailabilityUseCaseResult> {
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

    const [{ resource, closures, tenantOpening, resourceOpening }, existingBookings] =
      await Promise.all([
        this.loadScheduleContext(tenantId, input.date, input.resourceId),
        this.bookingPort.findApprovedByTenantAndDate(tenantId, input.date),
      ]);

    const slots = this.availabilityService.calculate({
      date: input.date,
      services: services.map((s) => ({ durationMinutes: s.durationMinutes })),
      businessHours,
      resource,
      slotGranularityMinutes,
      serviceBufferMinutes,
      closures,
      opening: tenantOpening,
      resourceOpening,
      existingBookings,
    });

    return { date: input.date, slots, available: slots.length > 0 };
  }

  // Combines tenant-wide rows (always fetched) with resource-scoped rows (fetched only when
  // resourceId is set) — both apply to a resource-scoped availability check (Codex PR #460
  // round-8 finding: resource-scoped closures/openings were previously never queried at all).
  private async loadScheduleContext(
    tenantId: string,
    date: string,
    resourceId: string | undefined,
  ): Promise<ScheduleContext> {
    if (resourceId == null) {
      const [closures, tenantOpening] = await Promise.all([
        this.closureRepo.findByTenantAndDate(tenantId, date),
        this.openingRepo.findByTenantAndDate(tenantId, date),
      ]);
      return {
        resource: null,
        closures,
        tenantOpening: tenantOpening ?? null,
        resourceOpening: null,
      };
    }

    const resource = await this.resourceRepo.findById(resourceId, tenantId);
    if (!resource) throw new ResourceNotFoundError(resourceId);

    const [tenantClosures, resourceClosures, tenantOpening, resourceOpening] = await Promise.all([
      this.closureRepo.findByTenantAndDate(tenantId, date),
      this.closureRepo.findByTenantAndDate(tenantId, date, resourceId),
      this.openingRepo.findByTenantAndDate(tenantId, date),
      this.openingRepo.findByTenantAndDate(tenantId, date, resourceId),
    ]);
    return {
      resource,
      closures: [...tenantClosures, ...resourceClosures],
      tenantOpening: tenantOpening ?? null,
      resourceOpening: resourceOpening ?? null,
    };
  }
}
