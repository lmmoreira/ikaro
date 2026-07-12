import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { Address } from '../../../../shared/value-objects/address';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { scheduleAfterCommit } from '../../../../shared/infrastructure/transaction-context';
import { Booking } from '../../domain/booking.aggregate';
import {
  BookingCustomerNotFoundError,
  BookingServiceNotActiveError,
  BookingServiceNotInTenantError,
  CustomerPhoneNotSetError,
} from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { IBookingCustomerPort, BOOKING_CUSTOMER_PORT } from '../ports/booking-customer.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { RequestAuthenticatedBookingDto } from '../dtos/request-authenticated-booking.dto';
import {
  buildLineInputs,
  createBookingAddress,
  toBookingResult,
  BookingRequestResult,
} from './booking-request.helpers';

export type RequestAuthenticatedBookingInput = RequestAuthenticatedBookingDto & {
  tenantId: string;
  correlationId: string;
  customerId: string;
  countryCode: string;
  timezone: string;
};

export type RequestAuthenticatedBookingUseCaseResult = BookingRequestResult;

@Injectable()
export class RequestAuthenticatedBookingUseCase {
  constructor(
    @Inject(BOOKING_CUSTOMER_PORT) private readonly customerProfilePort: IBookingCustomerPort,
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    private readonly slotConflictService: BookingSlotConflictService,
    private readonly photoExistenceService: PhotoExistenceService,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: RequestAuthenticatedBookingInput,
  ): Promise<RequestAuthenticatedBookingUseCaseResult> {
    const { tenantId, correlationId, customerId, countryCode, timezone } = input;

    const customer = await this.customerProfilePort.findById(customerId, tenantId);
    if (!customer) throw new BookingCustomerNotFoundError(customerId);
    if (!customer.phone) throw new CustomerPhoneNotSetError();

    const services = await this.serviceRepo.findByIds(input.serviceIds, tenantId);
    const serviceMap = new Map(services.map((s) => [s.id, s]));
    const uniqueIds = [...new Set(input.serviceIds)];
    for (const serviceId of uniqueIds) {
      const service = serviceMap.get(serviceId);
      if (!service) throw new BookingServiceNotInTenantError(serviceId);
      if (!service.isActive) throw new BookingServiceNotActiveError(serviceId);
    }

    const requiresPickup = input.serviceIds.some((id) => serviceMap.get(id)?.requiresPickupAddress);

    let pickupAddress: Address | undefined;
    if (input.pickupAddress) {
      pickupAddress = createBookingAddress(
        { ...input.pickupAddress, complement: input.pickupAddress.complement ?? undefined },
        CountryCode.create(countryCode).spec.address,
        'pickupAddress',
      );
    } else if (requiresPickup && customer.defaultAddress) {
      pickupAddress = customer.defaultAddress;
    }

    const scheduledAt = new Date(input.scheduledAt);
    const totalDurationMins = input.serviceIds.reduce(
      (sum, id) => sum + (serviceMap.get(id)?.durationMinutes ?? 0),
      0,
    );

    const bookingId = uuidv7();
    const { permanentPaths: beforeServicePhotoUrls, operations } =
      await this.photoExistenceService.preparePhotoPromotion(
        input.beforeServicePhotoUrls ?? [],
        tenantId,
        bookingId,
      );

    const lineInputs = buildLineInputs(input.serviceIds, serviceMap);

    const contactAddress = customer.defaultAddress ?? undefined;

    const booking = Booking.requestBooking({
      id: bookingId,
      tenantId,
      contactEmail: customer.email,
      contactName: customer.name,
      contactPhone: customer.phone,
      scheduledAt,
      lineInputs,
      type: 'CUSTOMER',
      correlationId,
      customerId,
      contactAddress,
      pickupAddress,
      notes: input.notes,
      beforeServicePhotoUrls,
    });

    await this.txManager.run(async () => {
      // This validation must stay inside the write transaction because lockTenantDay
      // uses pg_advisory_xact_lock, which only protects the slot check for this tx.
      await this.slotConflictService.assertSlotFree(
        tenantId,
        scheduledAt,
        totalDurationMins,
        timezone,
      );
      await this.bookingRepo.save(booking);
      await scheduleAfterCommit(() => this.photoExistenceService.executePhotoPromotion(operations));
    });

    return this.toResult(booking);
  }

  private toResult(booking: Booking): RequestAuthenticatedBookingUseCaseResult {
    return toBookingResult(booking);
  }
}
