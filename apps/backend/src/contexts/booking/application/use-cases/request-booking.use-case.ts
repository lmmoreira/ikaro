import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { Address } from '../../../../shared/value-objects/address';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Booking } from '../../domain/booking.aggregate';
import { Service } from '../../domain/service.aggregate';
import {
  BookingServiceNotActiveError,
  BookingServiceNotInTenantError,
} from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import {
  PhotoExistenceService,
  PhotoPromotionOperation,
} from '../services/photo-existence.service';
import { RequestBookingDto } from '../dtos/request-booking.dto';
import {
  buildLineInputs,
  createBookingAddress,
  persistRequestedBooking,
  toBookingResult,
} from './booking-request.helpers';
import { BookingRequestResult } from './booking-request.types';

export type RequestBookingInput = RequestBookingDto & {
  tenantId: string;
  correlationId: string;
  countryCode: string;
  timezone: string;
};

export type RequestBookingUseCaseResult = BookingRequestResult;

@Injectable()
export class RequestBookingUseCase {
  private readonly logger = new AppLogger(RequestBookingUseCase.name);

  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    private readonly slotConflictService: BookingSlotConflictService,
    private readonly photoExistenceService: PhotoExistenceService,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: RequestBookingInput): Promise<RequestBookingUseCaseResult> {
    const { tenantId, timezone } = input;

    const serviceMap = await this.resolveServices(input.serviceIds, tenantId);
    const { contactAddress, pickupAddress } = this.resolveAddresses(input);

    const { booking, scheduledAt, totalDurationMins, operations } = await this.prepareBooking(
      input,
      serviceMap,
      contactAddress,
      pickupAddress,
    );

    await persistRequestedBooking(
      this.txManager,
      this.slotConflictService,
      this.bookingRepo,
      this.photoExistenceService,
      { booking, tenantId, scheduledAt, totalDurationMins, timezone, operations },
    );

    this.logger.log('Booking requested', {
      tenantId,
      bookingId: booking.id,
      bookingType: booking.type,
    });

    return this.toResult(booking);
  }

  private async resolveServices(
    serviceIds: string[],
    tenantId: string,
  ): Promise<Map<string, Service>> {
    const services = await this.serviceRepo.findByIds(serviceIds, tenantId);
    const serviceMap = new Map(services.map((s) => [s.id, s]));
    for (const serviceId of new Set(serviceIds)) {
      const service = serviceMap.get(serviceId);
      if (!service) throw new BookingServiceNotInTenantError(serviceId);
      if (!service.isActive) throw new BookingServiceNotActiveError(serviceId);
    }
    return serviceMap;
  }

  private resolveAddresses(input: RequestBookingInput): {
    contactAddress: Address | undefined;
    pickupAddress: Address | undefined;
  } {
    const addressSpec = CountryCode.create(input.countryCode).spec.address;
    const buildAddress = (
      raw: RequestBookingInput['contactAddress'],
      field: 'pickupAddress' | 'contactAddress',
    ) =>
      raw
        ? createBookingAddress(
            { ...raw, complement: raw.complement ?? undefined },
            addressSpec,
            field,
          )
        : undefined;
    return {
      contactAddress: buildAddress(input.contactAddress, 'contactAddress'),
      pickupAddress: buildAddress(input.pickupAddress, 'pickupAddress'),
    };
  }

  private async prepareBooking(
    input: RequestBookingInput,
    serviceMap: Map<string, Service>,
    contactAddress: Address | undefined,
    pickupAddress: Address | undefined,
  ): Promise<{
    booking: Booking;
    scheduledAt: Date;
    totalDurationMins: number;
    operations: PhotoPromotionOperation[];
  }> {
    const scheduledAt = new Date(input.scheduledAt);
    const totalDurationMins = input.serviceIds.reduce(
      (sum, id) => sum + (serviceMap.get(id)?.durationMinutes ?? 0),
      0,
    );

    const bookingId = uuidv7();
    const { permanentPaths: beforeServicePhotoUrls, operations } =
      await this.photoExistenceService.preparePhotoPromotion(
        input.beforeServicePhotoUrls ?? [],
        input.tenantId,
        bookingId,
      );

    const lineInputs = buildLineInputs(input.serviceIds, serviceMap);
    const booking = this.buildBooking(
      input,
      bookingId,
      scheduledAt,
      lineInputs,
      contactAddress,
      pickupAddress,
      beforeServicePhotoUrls,
    );

    return { booking, scheduledAt, totalDurationMins, operations };
  }

  private buildBooking(
    input: RequestBookingInput,
    bookingId: string,
    scheduledAt: Date,
    lineInputs: ReturnType<typeof buildLineInputs>,
    contactAddress: Address | undefined,
    pickupAddress: Address | undefined,
    beforeServicePhotoUrls: string[],
  ): Booking {
    return Booking.requestBooking({
      id: bookingId,
      tenantId: input.tenantId,
      contactEmail: input.contactEmail,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      scheduledAt,
      lineInputs,
      type: 'GUEST',
      correlationId: input.correlationId,
      contactAddress,
      pickupAddress,
      notes: input.notes,
      beforeServicePhotoUrls,
    });
  }

  private toResult(booking: Booking): RequestBookingUseCaseResult {
    return toBookingResult(booking);
  }
}
