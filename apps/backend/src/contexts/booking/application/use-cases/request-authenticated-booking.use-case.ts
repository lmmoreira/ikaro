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
  BookingServiceSessionNotBookableError,
  CustomerPhoneNotSetError,
} from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import {
  IBookingCustomerPort,
  BOOKING_CUSTOMER_PORT,
  CustomerProfileDto,
} from '../ports/booking-customer.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import {
  IServiceIntakeSchemaRepository,
  SERVICE_INTAKE_SCHEMA_REPOSITORY,
} from '../ports/service-intake-schema-repository.port';
import { Service } from '../../domain/service.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { BookingQuoteService } from '../services/booking-quote.service';
import { BookingIntakeValidationService } from '../services/booking-intake-validation.service';
import {
  PhotoExistenceService,
  PhotoPromotionOperation,
} from '../services/photo-existence.service';
import { RequestAuthenticatedBookingDto } from '../dtos/request-authenticated-booking.dto';
import {
  createBookingAddress,
  persistRequestedBooking,
  resolveVariableServiceInputs,
  VariableServiceResolution,
} from './booking-request.helpers';
import { buildLineInputs, toBookingResult, toResourceSelections } from './booking-request.mapper';
import { BookingRequestResult } from './booking-request.types';

export type RequestAuthenticatedBookingUseCaseInput = RequestAuthenticatedBookingDto & {
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
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(SERVICE_INTAKE_SCHEMA_REPOSITORY)
    private readonly intakeSchemaRepo: IServiceIntakeSchemaRepository,
    private readonly availabilityService: AvailabilityService,
    private readonly slotConflictService: BookingSlotConflictService,
    private readonly photoExistenceService: PhotoExistenceService,
    private readonly quoteService: BookingQuoteService,
    private readonly intakeValidationService: BookingIntakeValidationService,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: RequestAuthenticatedBookingUseCaseInput,
  ): Promise<RequestAuthenticatedBookingUseCaseResult> {
    const { tenantId, customerId, countryCode } = input;

    const customer = await this.findCustomerWithPhone(customerId, tenantId);
    const serviceMap = await this.resolveServices(input.serviceIds, tenantId);
    const pickupAddress = this.resolvePickupAddress(input, customer, countryCode, serviceMap);
    const variableResolution = await resolveVariableServiceInputs(
      {
        intakeSchemaRepo: this.intakeSchemaRepo,
        quoteService: this.quoteService,
        intakeValidationService: this.intakeValidationService,
      },
      input.serviceIds,
      serviceMap,
      tenantId,
      input,
    );

    const { booking, scheduledAt, operations } = await this.prepareBooking(
      input,
      customer,
      serviceMap,
      pickupAddress,
      variableResolution,
    );

    return this.persistAndReturn(input, { booking, scheduledAt, operations, serviceMap });
  }

  private async persistAndReturn(
    input: RequestAuthenticatedBookingUseCaseInput,
    prepared: {
      booking: Booking;
      scheduledAt: Date;
      operations: PhotoPromotionOperation[];
      serviceMap: Map<string, Service>;
    },
  ): Promise<RequestAuthenticatedBookingUseCaseResult> {
    const { booking, scheduledAt, operations, serviceMap } = prepared;
    const candidatesByLine = await persistRequestedBooking(
      {
        txManager: this.txManager,
        slotConflictService: this.slotConflictService,
        bookingRepo: this.bookingRepo,
        photoExistenceService: this.photoExistenceService,
        serviceRepo: this.serviceRepo,
        resourceRepo: this.resourceRepo,
        occupancyRepo: this.occupancyRepo,
        availabilityService: this.availabilityService,
      },
      {
        booking,
        tenantId: input.tenantId,
        scheduledAt,
        timezone: input.timezone,
        operations,
        serviceMap,
        resourceSelections: toResourceSelections(input.resourceSelections),
      },
    );

    return this.toResult(booking, candidatesByLine);
  }

  private async prepareBooking(
    input: RequestAuthenticatedBookingUseCaseInput,
    customer: CustomerProfileDto & { phone: string },
    serviceMap: Map<string, Service>,
    pickupAddress: Address | undefined,
    variableResolution: VariableServiceResolution,
  ): Promise<{
    booking: Booking;
    scheduledAt: Date;
    operations: PhotoPromotionOperation[];
  }> {
    const scheduledAt = new Date(input.scheduledAt);

    const bookingId = uuidv7();
    const { permanentPaths: beforeServicePhotoUrls, operations } =
      await this.photoExistenceService.preparePhotoPromotion(
        input.beforeServicePhotoUrls ?? [],
        input.tenantId,
        bookingId,
      );

    const lineInputs = buildLineInputs(
      input.serviceIds,
      serviceMap,
      variableResolution.lineOverride,
    );
    const booking = this.buildBooking(input, customer, bookingId, scheduledAt, lineInputs, {
      pickupAddress,
      beforeServicePhotoUrls,
      variableResolution,
    });

    return { booking, scheduledAt, operations };
  }

  private buildBooking(
    input: RequestAuthenticatedBookingUseCaseInput,
    customer: CustomerProfileDto & { phone: string },
    bookingId: string,
    scheduledAt: Date,
    lineInputs: ReturnType<typeof buildLineInputs>,
    rest: {
      pickupAddress: Address | undefined;
      beforeServicePhotoUrls: string[];
      variableResolution: VariableServiceResolution;
    },
  ): Booking {
    const { pickupAddress, beforeServicePhotoUrls, variableResolution } = rest;
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
      participantCount: input.participantCount,
      intake: variableResolution.intake ?? undefined,
      attendeeInputs: variableResolution.attendeeInputs,
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
      if (service.bookingModel !== 'APPOINTMENT') {
        throw new BookingServiceSessionNotBookableError(serviceId);
      }
    }
    return serviceMap;
  }

  private resolvePickupAddress(
    input: RequestAuthenticatedBookingUseCaseInput,
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

  private toResult(
    booking: Booking,
    candidatesByLine: Awaited<ReturnType<typeof persistRequestedBooking>>,
  ): RequestAuthenticatedBookingUseCaseResult {
    return toBookingResult(booking, candidatesByLine);
  }
}
