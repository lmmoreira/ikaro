import { Inject, Injectable } from '@nestjs/common';
import { countrySpec } from '@ikaro/i18n';
import { Address } from '../../../../shared/value-objects/address';
import { IEventBus, EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { RequestContext } from '../../../../shared/request/request-context';
import { Booking } from '../../domain/booking.aggregate';
import {
  BookingServiceNotActiveError,
  BookingServiceNotInTenantError,
} from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { RequestBookingDto } from '../dtos/request-booking.dto';
import { buildLineInputs, toBookingResult, BookingRequestResult } from './booking-request.helpers';

export interface BookingLineResult {
  lineId: string;
  serviceId: string;
  priceAtBooking: { amount: number; currency: string };
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
}

export interface AddressResult {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  zipCode: string;
}

export type RequestBookingUseCaseResult = BookingRequestResult;

@Injectable()
export class RequestBookingUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    private readonly slotConflictService: BookingSlotConflictService,
    private readonly photoExistenceService: PhotoExistenceService,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly tenantContext: RequestContext,
  ) {}

  async execute(dto: RequestBookingDto): Promise<RequestBookingUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const correlationId = this.tenantContext.correlationId;
    const { countryCode } = this.tenantContext.settings.localization;
    const addressSpec = countrySpec(countryCode).address;

    const services = await this.serviceRepo.findByIds(dto.serviceIds, tenantId);
    const serviceMap = new Map(services.map((s) => [s.id, s]));
    const uniqueIds = [...new Set(dto.serviceIds)];
    for (const serviceId of uniqueIds) {
      const service = serviceMap.get(serviceId);
      if (!service) throw new BookingServiceNotInTenantError(serviceId);
      if (!service.isActive) throw new BookingServiceNotActiveError(serviceId);
    }

    const scheduledAt = new Date(dto.scheduledAt);
    const totalDurationMins = dto.serviceIds.reduce(
      (sum, id) => sum + (serviceMap.get(id)?.durationMinutes ?? 0),
      0,
    );

    await this.slotConflictService.assertSlotFree(tenantId, scheduledAt, totalDurationMins);
    await this.photoExistenceService.assertPhotosUploaded(
      dto.beforeServicePhotoUrls ?? [],
      tenantId,
    );

    const lineInputs = buildLineInputs(dto.serviceIds, serviceMap);

    const contactAddress = dto.contactAddress
      ? Address.create(
          { ...dto.contactAddress, complement: dto.contactAddress.complement ?? undefined },
          addressSpec,
        )
      : undefined;
    const pickupAddress = dto.pickupAddress
      ? Address.create(
          { ...dto.pickupAddress, complement: dto.pickupAddress.complement ?? undefined },
          addressSpec,
        )
      : undefined;

    const booking = Booking.requestBooking({
      tenantId,
      contactEmail: dto.contactEmail,
      contactName: dto.contactName,
      contactPhone: dto.contactPhone,
      scheduledAt,
      lineInputs,
      type: 'GUEST',
      correlationId,
      contactAddress,
      pickupAddress,
      notes: dto.notes,
      beforeServicePhotoUrls: dto.beforeServicePhotoUrls,
    });

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
    });

    for (const event of booking.clearDomainEvents()) {
      await this.eventBus.publish(event);
    }

    return this.toResult(booking);
  }

  private toResult(booking: Booking): RequestBookingUseCaseResult {
    return toBookingResult(booking);
  }
}
