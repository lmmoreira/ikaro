import { Inject, Injectable } from '@nestjs/common';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import {
  AvailabilityRangeInvalidError,
  BookingServiceNotActiveError,
  BookingServiceResourceTypeUnavailableError,
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
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { BookingQuoteService } from '../services/booking-quote.service';
import { toResourceSelections } from './booking-request.mapper';
import { GetAvailabilitySummaryDto } from '../dtos/get-availability-summary.dto';
import { AvailabilityLine, buildAvailabilityLines } from './availability-lines.helpers';
import { isDegenerateService } from './availability-resource-scope.helpers';
import {
  buildDaySummaries,
  buildResourceScopedSummary,
  DaySummary,
  findResource,
  loadScheduleRange,
  SummaryDeps,
} from './availability-summary.helpers';

export type GetAvailabilitySummaryUseCaseInput = GetAvailabilitySummaryDto & {
  tenantId: string;
  businessHours: BusinessHours;
  slotGranularityMinutes: 15 | 30 | 60;
  serviceBufferMinutes: number;
  maxBookingAdvanceDays: number;
};

export type { DaySummary };

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
    private readonly quoteService: BookingQuoteService,
  ) {}

  async execute(
    input: GetAvailabilitySummaryUseCaseInput,
  ): Promise<GetAvailabilitySummaryUseCaseResult> {
    const { tenantId, maxBookingAdvanceDays } = input;

    this.validateRange(input.from, input.to, maxBookingAdvanceDays);
    const services = await this.findAndValidateServices(input.serviceIds, tenantId);
    const lines = await buildAvailabilityLines(
      { quoteService: this.quoteService, resourceRepo: this.resourceRepo },
      tenantId,
      services,
      {
        resourceSelections: toResourceSelections(input.resourceSelections),
        durationMinutes: input.durationMinutes,
      },
    );

    if (input.resourceId != null) {
      return this.buildSummaryForResources(input, lines, [input.resourceId]);
    }
    const hasPins = lines.some((line) => line.pins.size > 0);
    if (!hasPins && lines.every((line) => isDegenerateService(line.service))) {
      const [locationResource] = await this.resourceRepo.findByTenant(tenantId, {
        type: ResourceType.LOCATION,
        isActive: true,
      });
      if (!locationResource) {
        throw new BookingServiceResourceTypeUnavailableError(ResourceType.LOCATION);
      }
      return this.buildSummaryForResources(input, lines, [locationResource.id], true);
    }
    return buildResourceScopedSummary(this.deps(), input, tenantId, lines);
  }

  private deps(): SummaryDeps {
    return {
      closureRepo: this.closureRepo,
      openingRepo: this.openingRepo,
      resourceRepo: this.resourceRepo,
      bookingPort: this.bookingPort,
      availabilityService: this.availabilityService,
    };
  }

  // Shared by the explicit-resourceId path and the degenerate (tenant-wide LOCATION) path — both
  // reduce to "one resource, one occupancy range fetch, one calculate() per day."
  private async buildSummaryForResources(
    input: GetAvailabilitySummaryUseCaseInput,
    lines: AvailabilityLine[],
    resourceIds: string[],
    tenantWideScheduleContext = false,
  ): Promise<GetAvailabilitySummaryUseCaseResult> {
    const { tenantId } = input;
    const resource = tenantWideScheduleContext
      ? null
      : await findResource(this.resourceRepo, tenantId, resourceIds[0]);
    const [scheduleRange, occupancy] = await Promise.all([
      loadScheduleRange(
        this.deps(),
        tenantId,
        input.from,
        input.to,
        tenantWideScheduleContext ? undefined : resourceIds[0],
      ),
      this.bookingPort.findOccupancyByTenantAndResource(
        tenantId,
        resourceIds,
        input.from,
        input.to,
        input.businessHours.timezone,
      ),
    ]);

    return buildDaySummaries(
      this.availabilityService,
      input,
      lines,
      resource,
      scheduleRange,
      occupancy,
    );
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

  private daysBetween(from: string, to: string): number {
    const msPerDay = 86_400_000;
    return (
      (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / msPerDay
    );
  }
}
