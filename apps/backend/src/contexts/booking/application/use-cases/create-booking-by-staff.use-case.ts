import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { Address } from '../../../../shared/value-objects/address';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Booking } from '../../domain/booking.aggregate';
import { Service } from '../../domain/service.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import { CreateBookingByStaffDto } from '../dtos/create-booking-by-staff.dto';
import { IBookingCustomerPort, BOOKING_CUSTOMER_PORT } from '../ports/booking-customer.port';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import {
  IServiceIntakeSchemaRepository,
  SERVICE_INTAKE_SCHEMA_REPOSITORY,
} from '../ports/service-intake-schema-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { BookingIntakeValidationService } from '../services/booking-intake-validation.service';
import { BookingQuoteService } from '../services/booking-quote.service';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { PhotoExistenceService } from '../services/photo-existence.service';
import {
  createBookingAddress,
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

export type CreateBookingByStaffUseCaseInput = CreateBookingByStaffDto &
  BookingWindowRequest & {
    tenantId: string;
    correlationId: string;
    // The acting staff member, from the request context — never from the body.
    staffId: string;
    countryCode: string;
  };

export type CreateBookingByStaffUseCaseResult = BookingRequestResult;

type GuestInput = Extract<CreateBookingByStaffDto, { contactEmail: string }>;
type CustomerProfile = Awaited<ReturnType<typeof findCustomerWithPhone>>;

// Who the booking is for, resolved from either input shape: the contact snapshot the booking
// stores, and the pickup address the person's side can supply.
interface BookingSubject {
  type: 'CUSTOMER' | 'GUEST';
  customerId?: string;
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  contactAddress?: Address;
  pickupAddress?: Address;
}

// UC-108 — staff books a one-off appointment for someone who phoned or walked in. The booking is
// created directly APPROVED (the staff member is the approver), so it takes a COMMITTED occupancy
// from the start and raises BookingApproved, not BookingRequested. Everything else — services,
// window, resources, duration, intake, conflicts — runs through the same helpers as UC-001/UC-002.
@Injectable()
export class CreateBookingByStaffUseCase {
  private readonly logger = new AppLogger(CreateBookingByStaffUseCase.name);

  constructor(
    @Inject(BOOKING_CUSTOMER_PORT) private readonly customerPort: IBookingCustomerPort,
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
    input: CreateBookingByStaffUseCaseInput,
  ): Promise<CreateBookingByStaffUseCaseResult> {
    const { tenantId } = input;

    const customer =
      'customerId' in input
        ? await findCustomerWithPhone(this.customerPort, input.customerId, tenantId)
        : null;
    const serviceMap = await resolveBookableServices(this.serviceRepo, input.serviceIds, tenantId);
    assertWithinEffectiveBookingWindow(input, serviceMap.values(), { ignoreMinAdvance: true });

    const subject = this.resolveSubject(input, customer, serviceMap);
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
      // Staff may skip the intake on the customer's behalf (UC-108).
      { intakeOptional: true },
    );

    const booking = this.buildBooking(input, subject, serviceMap, variableResolution);
    const candidatesByLine = await this.persist(input, booking, serviceMap);

    this.logger.log('Booking created by staff', {
      tenantId,
      bookingId: booking.id,
      bookingType: booking.type,
      staffId: input.staffId,
    });

    return toBookingResult(booking, candidatesByLine);
  }

  private persist(
    input: CreateBookingByStaffUseCaseInput,
    booking: Booking,
    serviceMap: Map<string, Service>,
  ): ReturnType<typeof persistRequestedBooking> {
    return persistRequestedBooking(
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
        scheduledAt: new Date(input.scheduledAt),
        timezone: input.timezone,
        operations: [],
        serviceMap,
        resourceSelections: toResourceSelections(input.resourceSelections),
        occupancyLockState: 'COMMITTED',
      },
    );
  }

  private resolveSubject(
    input: CreateBookingByStaffUseCaseInput,
    customer: CustomerProfile | null,
    serviceMap: Map<string, Service>,
  ): BookingSubject {
    if (customer && 'customerId' in input) {
      return this.resolveCustomerSubject(input, customer, serviceMap);
    }
    return this.resolveGuestSubject(
      input as GuestInput & CreateBookingByStaffUseCaseInput,
      serviceMap,
    );
  }

  private resolveCustomerSubject(
    input: CreateBookingByStaffUseCaseInput & { customerId: string },
    customer: CustomerProfile,
    serviceMap: Map<string, Service>,
  ): BookingSubject {
    return {
      type: 'CUSTOMER',
      customerId: input.customerId,
      contactEmail: customer.email,
      contactName: customer.name,
      contactPhone: customer.phone,
      contactAddress: customer.defaultAddress ?? undefined,
      pickupAddress: resolvePickupAddress(
        input.pickupAddress,
        customer.defaultAddress,
        input.countryCode,
        input.serviceIds,
        serviceMap,
      ),
    };
  }

  private resolveGuestSubject(
    guest: GuestInput & CreateBookingByStaffUseCaseInput,
    serviceMap: Map<string, Service>,
  ): BookingSubject {
    return {
      type: 'GUEST',
      contactEmail: guest.contactEmail,
      contactName: guest.contactName,
      contactPhone: guest.contactPhone,
      contactAddress: guest.contactAddress
        ? createBookingAddress(
            { ...guest.contactAddress, complement: guest.contactAddress.complement ?? undefined },
            CountryCode.create(guest.countryCode).spec.address,
            'contactAddress',
          )
        : undefined,
      // A guest has no default address to fall back on: a pickup-required service without one is
      // refused by the aggregate.
      pickupAddress: resolvePickupAddress(
        guest.pickupAddress,
        undefined,
        guest.countryCode,
        guest.serviceIds,
        serviceMap,
      ),
    };
  }

  private buildBooking(
    input: CreateBookingByStaffUseCaseInput,
    subject: BookingSubject,
    serviceMap: Map<string, Service>,
    variableResolution: VariableServiceResolution,
  ): Booking {
    return Booking.createByStaff({
      id: uuidv7(),
      tenantId: input.tenantId,
      staffId: input.staffId,
      correlationId: input.correlationId,
      scheduledAt: new Date(input.scheduledAt),
      lineInputs: buildLineInputs(input.serviceIds, serviceMap, variableResolution.lineOverride),
      notes: input.notes,
      participantCount: input.participantCount,
      intake: variableResolution.intake ?? undefined,
      attendeeInputs: variableResolution.attendeeInputs,
      ...subject,
    });
  }
}
