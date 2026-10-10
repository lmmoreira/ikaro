import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { Address } from '../../../../shared/value-objects/address';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Booking } from '../../domain/booking.aggregate';
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
  persistRequestedBooking,
  resolveVariableServiceInputs,
  VariableServiceResolution,
} from './booking-request.helpers';
import {
  findCustomerWithPhone,
  resolveBookableServices,
  resolvePickupAddress,
} from './booking-request-subject.helpers';
import { buildLineInputs, toBookingResult, toResourceSelections } from './booking-request.mapper';
import { BookingRequestResult } from './booking-request.types';
import { assertWithinEffectiveBookingWindow, BookingWindowRequest } from './booking-window.helpers';

export type RequestAuthenticatedBookingUseCaseInput = RequestAuthenticatedBookingDto &
  BookingWindowRequest & {
    tenantId: string;
    correlationId: string;
    customerId: string;
    countryCode: string;
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

    const customer = await findCustomerWithPhone(this.customerProfilePort, customerId, tenantId);
    const serviceMap = await resolveBookableServices(this.serviceRepo, input.serviceIds, tenantId);
    assertWithinEffectiveBookingWindow(input, serviceMap.values());
    const pickupAddress = resolvePickupAddress(
      input.pickupAddress,
      customer.defaultAddress,
      countryCode,
      input.serviceIds,
      serviceMap,
    );
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

  private toResult(
    booking: Booking,
    candidatesByLine: Awaited<ReturnType<typeof persistRequestedBooking>>,
  ): RequestAuthenticatedBookingUseCaseResult {
    return toBookingResult(booking, candidatesByLine);
  }
}
