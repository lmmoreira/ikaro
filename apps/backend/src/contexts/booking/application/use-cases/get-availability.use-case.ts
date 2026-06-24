import { Inject, Injectable } from '@nestjs/common';
import { todayUTC } from '../../../../shared/utils/calendar-date';
import { RequestContext } from '../../../../shared/request/request-context';
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  AvailabilityDateInPastError,
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
import { GetAvailabilityDto } from '../dtos/get-availability.dto';

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
    private readonly tenantContext: RequestContext,
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(SCHEDULE_CLOSURE_REPOSITORY) private readonly closureRepo: IScheduleClosureRepository,
    @Inject(SCHEDULE_OPENING_REPOSITORY) private readonly openingRepo: IScheduleOpeningRepository,
    @Inject(BOOKING_AVAILABILITY_PORT)
    private readonly bookingPort: IBookingAvailabilityPort,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async execute(dto: GetAvailabilityDto): Promise<GetAvailabilityUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;

    const today = todayUTC();
    if (dto.date < today) throw new AvailabilityDateInPastError();

    const { businessHours, booking: bookingSettings } = this.tenantContext.settings;

    const services = await this.serviceRepo.findByIds(dto.serviceIds, tenantId);

    for (const requestedId of dto.serviceIds) {
      const service = services.find((s) => s.id === requestedId);
      if (!service) {
        throw new BookingDomainError(`Service not found: ${requestedId}`);
      }
      if (!service.isActive) {
        throw new BookingDomainError(`Service is not active: ${requestedId}`);
      }
    }

    const [closures, opening, existingBookings] = await Promise.all([
      this.closureRepo.findByTenantAndDate(tenantId, dto.date),
      this.openingRepo.findByTenantAndDate(tenantId, dto.date),
      this.bookingPort.findApprovedByTenantAndDate(tenantId, dto.date),
    ]);

    const slots = this.availabilityService.calculate({
      date: dto.date,
      services: services.map((s) => ({ durationMinutes: s.durationMinutes })),
      businessHours,
      slotGranularityMinutes: bookingSettings.slotGranularityMinutes,
      serviceBufferMinutes: bookingSettings.serviceBufferMinutes,
      closures,
      opening: opening ?? null,
      existingBookings,
    });

    return { date: dto.date, slots, available: slots.length > 0 };
  }
}
