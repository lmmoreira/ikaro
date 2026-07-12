import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { scheduleAfterCommit } from '../../../../shared/infrastructure/transaction-context';
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
import {
  buildLineInputs,
  createBookingAddress,
  toBookingResult,
  BookingRequestResult,
} from './booking-request.helpers';

export type RequestBookingInput = RequestBookingDto & {
  tenantId: string;
  correlationId: string;
  countryCode: string;
  timezone: string;
};

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
  ) {}

  async execute(input: RequestBookingInput): Promise<RequestBookingUseCaseResult> {
    const { tenantId, correlationId, countryCode, timezone } = input;
    const addressSpec = CountryCode.create(countryCode).spec.address;

    const services = await this.serviceRepo.findByIds(input.serviceIds, tenantId);
    const serviceMap = new Map(services.map((s) => [s.id, s]));
    const uniqueIds = [...new Set(input.serviceIds)];
    for (const serviceId of uniqueIds) {
      const service = serviceMap.get(serviceId);
      if (!service) throw new BookingServiceNotInTenantError(serviceId);
      if (!service.isActive) throw new BookingServiceNotActiveError(serviceId);
    }

    const scheduledAt = new Date(input.scheduledAt);
    const totalDurationMins = input.serviceIds.reduce(
      (sum, id) => sum + (serviceMap.get(id)?.durationMinutes ?? 0),
      0,
    );

    await this.slotConflictService.assertSlotFree(
      tenantId,
      scheduledAt,
      totalDurationMins,
      timezone,
    );
    const bookingId = uuidv7();
    const { permanentPaths: beforeServicePhotoUrls, operations } =
      await this.photoExistenceService.preparePhotoPromotion(
        input.beforeServicePhotoUrls ?? [],
        tenantId,
        bookingId,
      );

    const lineInputs = buildLineInputs(input.serviceIds, serviceMap);

    const contactAddress = input.contactAddress
      ? createBookingAddress(
          { ...input.contactAddress, complement: input.contactAddress.complement ?? undefined },
          addressSpec,
          'contactAddress',
        )
      : undefined;
    const pickupAddress = input.pickupAddress
      ? createBookingAddress(
          { ...input.pickupAddress, complement: input.pickupAddress.complement ?? undefined },
          addressSpec,
          'pickupAddress',
        )
      : undefined;

    const booking = Booking.requestBooking({
      id: bookingId,
      tenantId,
      contactEmail: input.contactEmail,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      scheduledAt,
      lineInputs,
      type: 'GUEST',
      correlationId,
      contactAddress,
      pickupAddress,
      notes: input.notes,
      beforeServicePhotoUrls,
    });

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
      await scheduleAfterCommit(() => this.photoExistenceService.executePhotoPromotion(operations));
    });

    return this.toResult(booking);
  }

  private toResult(booking: Booking): RequestBookingUseCaseResult {
    return toBookingResult(booking);
  }
}
