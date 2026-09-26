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
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  BookingServiceNotActiveError,
  BookingServiceNotInTenantError,
  BookingServiceSessionNotBookableError,
} from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
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
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { BookingQuoteService } from '../services/booking-quote.service';
import { BookingIntakeValidationService } from '../services/booking-intake-validation.service';
import {
  PhotoExistenceService,
  PhotoPromotionOperation,
} from '../services/photo-existence.service';
import { RequestBookingDto } from '../dtos/request-booking.dto';
import {
  createBookingAddress,
  persistRequestedBooking,
  resolveVariableServiceInputs,
  VariableServiceResolution,
} from './booking-request.helpers';
import { buildLineInputs, toBookingResult, toResourceSelections } from './booking-request.mapper';
import { BookingRequestResult } from './booking-request.types';

export type RequestBookingUseCaseInput = RequestBookingDto & {
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

  async execute(input: RequestBookingUseCaseInput): Promise<RequestBookingUseCaseResult> {
    const { tenantId } = input;

    const serviceMap = await this.resolveServices(input.serviceIds, tenantId);
    const { contactAddress, pickupAddress } = this.resolveAddresses(input);
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
      serviceMap,
      { contactAddress, pickupAddress },
      variableResolution,
    );

    return this.persistAndLog(input, { booking, scheduledAt, operations, serviceMap });
  }

  private async persistAndLog(
    input: RequestBookingUseCaseInput,
    prepared: {
      booking: Booking;
      scheduledAt: Date;
      operations: PhotoPromotionOperation[];
      serviceMap: Map<string, Service>;
    },
  ): Promise<RequestBookingUseCaseResult> {
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

    this.logger.log('Booking requested', {
      tenantId: input.tenantId,
      bookingId: booking.id,
      bookingType: booking.type,
    });

    return this.toResult(booking, candidatesByLine);
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

  private resolveAddresses(input: RequestBookingUseCaseInput): {
    contactAddress: Address | undefined;
    pickupAddress: Address | undefined;
  } {
    const addressSpec = CountryCode.create(input.countryCode).spec.address;
    const buildAddress = (
      raw: RequestBookingUseCaseInput['contactAddress'],
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
    input: RequestBookingUseCaseInput,
    serviceMap: Map<string, Service>,
    addresses: { contactAddress: Address | undefined; pickupAddress: Address | undefined },
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
    const booking = this.buildBooking(input, bookingId, scheduledAt, lineInputs, {
      ...addresses,
      beforeServicePhotoUrls,
      variableResolution,
    });

    return { booking, scheduledAt, operations };
  }

  private buildBooking(
    input: RequestBookingUseCaseInput,
    bookingId: string,
    scheduledAt: Date,
    lineInputs: ReturnType<typeof buildLineInputs>,
    rest: {
      contactAddress: Address | undefined;
      pickupAddress: Address | undefined;
      beforeServicePhotoUrls: string[];
      variableResolution: VariableServiceResolution;
    },
  ): Booking {
    const { contactAddress, pickupAddress, beforeServicePhotoUrls, variableResolution } = rest;
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
      participantCount: input.participantCount,
      intake: variableResolution.intake ?? undefined,
      attendeeInputs: variableResolution.attendeeInputs,
    });
  }

  private toResult(
    booking: Booking,
    candidatesByLine: Awaited<ReturnType<typeof persistRequestedBooking>>,
  ): RequestBookingUseCaseResult {
    return toBookingResult(booking, candidatesByLine);
  }
}
