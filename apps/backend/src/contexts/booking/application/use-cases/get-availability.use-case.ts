import { Inject, Injectable } from '@nestjs/common';
import { todayUTC } from '../../../../shared/utils/calendar-date';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { AvailabilityService, AvailableSlot } from '../../domain/services/availability.service';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import { ScheduleClosure } from '../../domain/schedule-closure.aggregate';
import { ScheduleOpening } from '../../domain/schedule-opening.aggregate';
import {
  AvailabilityDateInPastError,
  BookingServiceNotActiveError,
  BookingServiceResourceTypeUnavailableError,
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
import { GetAvailabilityDto } from '../dtos/get-availability.dto';
import { isDegenerateService } from './availability-resource-scope.helpers';
import { calculateResourceScopedAvailability } from './resource-scoped-availability.helpers';

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
    const { tenantId } = input;

    const today = todayUTC();
    if (input.date < today) throw new AvailabilityDateInPastError();

    const services = await this.findAndValidateServices(input.serviceIds, tenantId);

    const slots = await this.computeSlots(input, services);
    return { date: input.date, slots, available: slots.length > 0 };
  }

  private async findAndValidateServices(
    serviceIds: string[],
    tenantId: string,
  ): Promise<Service[]> {
    const services = await this.serviceRepo.findByIds(serviceIds, tenantId);
    for (const requestedId of serviceIds) {
      const service = services.find((s) => s.id === requestedId);
      if (!service) throw new ServiceNotFoundError(requestedId);
      if (!service.isActive) throw new BookingServiceNotActiveError(requestedId);
    }
    return services;
  }

  private async computeSlots(
    input: GetAvailabilityUseCaseInput,
    services: Service[],
  ): Promise<AvailableSlot[]> {
    // An explicit resourceId (a manager/staff view of one specific resource's own schedule,
    // independent of any service's resourceRequirements) is unchanged from before M22-S03 — only
    // its occupancy source moves from the old tenant-wide port method to the new resource-scoped
    // one, for that one resource.
    if (input.resourceId != null) {
      return this.calculateForResource(input, services, input.resourceId);
    }
    if (services.every((s) => isDegenerateService(s))) {
      return this.calculateDegenerate(input, services);
    }
    return this.calculateResourceScoped(input, services);
  }

  private async calculateForResource(
    input: GetAvailabilityUseCaseInput,
    services: Service[],
    resourceId: string,
  ): Promise<AvailableSlot[]> {
    const { businessHours, slotGranularityMinutes, serviceBufferMinutes } = input;
    const [{ resource, closures, tenantOpening, resourceOpening }, existingOccupancy] =
      await Promise.all([
        this.loadScheduleContext(input.tenantId, input.date, resourceId),
        this.bookingPort.findOccupancyByTenantAndResource(
          input.tenantId,
          [resourceId],
          input.date,
          input.date,
          businessHours.timezone,
        ),
      ]);
    return this.availabilityService.calculate({
      date: input.date,
      services: services.map((s) => ({ durationMinutes: s.durationMinutes })),
      businessHours,
      resource,
      slotGranularityMinutes,
      // Only the last requested service's own buffer applies (matching
      // effectiveFlatGapMinutes's last-line-only rule everywhere else) — the tenant default is
      // only a fallback for a service with no override.
      serviceBufferMinutes: services.at(-1)!.bufferAfterMinutes ?? serviceBufferMinutes,
      closures,
      opening: tenantOpening,
      resourceOpening,
      existingOccupancy,
    });
  }

  // Today's exact tenant-wide behavior — occupancy now sourced from the LOCATION resource's own
  // resource_occupancy rows instead of raw bookings, but every other input is byte-identical.
  private async calculateDegenerate(
    input: GetAvailabilityUseCaseInput,
    services: Service[],
  ): Promise<AvailableSlot[]> {
    const { tenantId, businessHours, slotGranularityMinutes, serviceBufferMinutes } = input;
    const [locationResource] = await this.resourceRepo.findByTenant(tenantId, {
      type: ResourceType.LOCATION,
      isActive: true,
    });
    if (!locationResource) {
      throw new BookingServiceResourceTypeUnavailableError(ResourceType.LOCATION);
    }

    const [{ closures, tenantOpening }, existingOccupancy] = await Promise.all([
      this.loadScheduleContext(tenantId, input.date, undefined),
      this.bookingPort.findOccupancyByTenantAndResource(
        tenantId,
        [locationResource.id],
        input.date,
        input.date,
        businessHours.timezone,
      ),
    ]);

    return this.availabilityService.calculate({
      date: input.date,
      services: services.map((s) => ({ durationMinutes: s.durationMinutes })),
      businessHours,
      resource: null,
      slotGranularityMinutes,
      serviceBufferMinutes: services.at(-1)!.bufferAfterMinutes ?? serviceBufferMinutes,
      closures,
      opening: tenantOpening,
      resourceOpening: null,
      existingOccupancy,
    });
  }

  private async calculateResourceScoped(
    input: GetAvailabilityUseCaseInput,
    services: Service[],
  ): Promise<AvailableSlot[]> {
    return calculateResourceScopedAvailability(
      {
        resourceRepo: this.resourceRepo,
        availabilityService: this.availabilityService,
        loadScheduleContext: (resourceId) =>
          this.loadScheduleContext(input.tenantId, input.date, resourceId),
        loadOccupancy: (resourceId, date, timezone) =>
          this.bookingPort.findOccupancyByTenantAndResource(
            input.tenantId,
            [resourceId],
            date,
            date,
            timezone,
          ),
      },
      input,
      services,
    );
  }

  // Combines tenant-wide rows (always fetched) with resource-scoped rows (fetched only when
  // resourceId is set) — both apply to a resource-scoped availability check.
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
    if (!resource.isActive) throw new ResourceNotActiveError(resourceId);

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
