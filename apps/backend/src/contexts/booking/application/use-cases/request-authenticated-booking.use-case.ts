import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { Address } from '../../../../shared/value-objects/address';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Booking } from '../../domain/booking.aggregate';
import {
  BookingCustomerNotFoundError,
  BookingServiceNotActiveError,
  BookingServiceNotInTenantError,
  CustomerPhoneNotSetError,
} from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import {
  IBookingCustomerPort,
  BOOKING_CUSTOMER_PORT,
  CustomerProfileDto,
} from '../ports/booking-customer.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { Service } from '../../domain/service.aggregate';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import {
  PhotoExistenceService,
  PhotoPromotionOperation,
} from '../services/photo-existence.service';
import { RequestAuthenticatedBookingDto } from '../dtos/request-authenticated-booking.dto';
import {
  buildLineInputs,
  createBookingAddress,
  persistRequestedBooking,
  toBookingResult,
} from './booking-request.helpers';
import { BookingRequestResult } from './booking-request.types';

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
    const { tenantId, customerId, countryCode, timezone } = input;

    const customer = await this.findCustomerWithPhone(customerId, tenantId);
    const serviceMap = await this.resolveServices(input.serviceIds, tenantId);
    const pickupAddress = this.resolvePickupAddress(input, customer, countryCode, serviceMap);

    const { booking, scheduledAt, totalDurationMins, operations } = await this.prepareBooking(
      input,
      customer,
      serviceMap,
      pickupAddress,
    );

    await persistRequestedBooking(
      this.txManager,
      this.slotConflictService,
      this.bookingRepo,
      this.photoExistenceService,
      { booking, tenantId, scheduledAt, totalDurationMins, timezone, operations },
    );

    return this.toResult(booking);
  }

  private async prepareBooking(
    input: RequestAuthenticatedBookingInput,
    customer: CustomerProfileDto & { phone: string },
    serviceMap: Map<string, Service>,
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
      customer,
      bookingId,
      scheduledAt,
      lineInputs,
      pickupAddress,
      beforeServicePhotoUrls,
    );

    return { booking, scheduledAt, totalDurationMins, operations };
  }

  private buildBooking(
    input: RequestAuthenticatedBookingInput,
    customer: CustomerProfileDto & { phone: string },
    bookingId: string,
    scheduledAt: Date,
    lineInputs: ReturnType<typeof buildLineInputs>,
    pickupAddress: Address | undefined,
    beforeServicePhotoUrls: string[],
  ): Booking {
    return Booking.requestBooking({
      id: bookingId,
      tenantId: input.tenantId,
      contactEmail: customer.email,
      contactName: customer.name,
      contactPhone: customer.phone,
      scheduledAt,
      lineInputs,
      type: 'CUSTOMER',
      correlationId: input.correlationId,
      customerId: input.customerId,
      contactAddress: customer.defaultAddress ?? undefined,
      pickupAddress,
      notes: input.notes,
      beforeServicePhotoUrls,
    });
  }

  private async findCustomerWithPhone(
    customerId: string,
    tenantId: string,
  ): Promise<CustomerProfileDto & { phone: string }> {
    const customer = await this.customerProfilePort.findById(customerId, tenantId);
    if (!customer) throw new BookingCustomerNotFoundError(customerId);
    if (!customer.phone) throw new CustomerPhoneNotSetError();
    return customer as CustomerProfileDto & { phone: string };
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

  private resolvePickupAddress(
    input: RequestAuthenticatedBookingInput,
    customer: CustomerProfileDto,
    countryCode: string,
    serviceMap: Map<string, Service>,
  ): Address | undefined {
    if (input.pickupAddress) {
      return createBookingAddress(
        { ...input.pickupAddress, complement: input.pickupAddress.complement ?? undefined },
        CountryCode.create(countryCode).spec.address,
        'pickupAddress',
      );
    }
    const requiresPickup = input.serviceIds.some((id) => serviceMap.get(id)?.requiresPickupAddress);
    if (requiresPickup && customer.defaultAddress) return customer.defaultAddress;
    return undefined;
  }

  private toResult(booking: Booking): RequestAuthenticatedBookingUseCaseResult {
    return toBookingResult(booking);
  }
}
