import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryServiceIntakeSchemaRepository } from '../../../../test/repositories/booking/in-memory-service-intake-schema.repository';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceType } from '../../domain/resource.types';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { BookingQuoteService } from '../services/booking-quote.service';
import { BookingIntakeValidationService } from '../services/booking-intake-validation.service';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ServiceBookingIntakeSchema } from '../../domain/service-booking-intake-schema';
import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { testAddress, testAddressProps } from '../../../../test/utils/address-helpers';
import { futureDate } from '../../../../test/utils/date-helpers';
import { AddressErrorCode } from '@ikaro/types';
import {
  BookingAddressValidationError,
  BookingDurationOutOfRangeError,
  BookingIntakeAnswerMissingError,
  BookingInvalidMultipleVariableServicesError,
  BookingPhotoNotUploadedError,
  BookingServiceConcurrentModificationError,
  BookingServiceSessionNotBookableError,
  BookingSlotUnavailableError,
} from '../../domain/errors/booking-domain.error';
import { BookingStatus } from '../../domain/booking.aggregate';
import { RequestBookingUseCase } from './request-booking.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000100';
const CORRELATION_ID = 'corr-request-booking-test';

const scheduledAt = `${futureDate(1)}T10:00:00.000Z`;

describe('RequestBookingUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let intakeSchemaRepo: InMemoryServiceIntakeSchemaRepository;
  let bookingRepo: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;
  let storageService: InMemoryStorageService;
  let useCase: RequestBookingUseCase;
  let serviceId: string;

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    intakeSchemaRepo = new InMemoryServiceIntakeSchemaRepository();
    eventBus = new InMemoryEventBus();
    bookingRepo = new InMemoryBookingRepository(eventBus);
    storageService = new InMemoryStorageService();
    const txManager = new InMemoryTransactionManager();
    useCase = new RequestBookingUseCase(
      serviceRepo,
      resourceRepo,
      occupancyRepo,
      intakeSchemaRepo,
      new AvailabilityService(),
      new BookingSlotConflictService(occupancyRepo, new InMemoryTenantLock()),
      new PhotoExistenceService(storageService),
      new BookingQuoteService(),
      new BookingIntakeValidationService(intakeSchemaRepo),
      bookingRepo,
      txManager,
    );
    const service = new ServiceBuilder().withTenantId(TENANT_A).withName('Lavagem Simples').build();
    await serviceRepo.save(service);
    serviceId = service.id;
    // M22-S03: a service with zero resourceRequirements (every fixture here by default) falls
    // back to the tenant's LOCATION resource during write-path resolution.
    await resourceRepo.save(
      new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.LOCATION).build(),
    );
  });

  const baseInput = () => ({
    contactEmail: 'joao@example.com',
    contactName: 'João Silva',
    contactPhone: '+5531999999999',
    scheduledAt,
    serviceIds: [serviceId],
    beforeServicePhotoUrls: undefined as string[] | undefined,
    contactAddress: undefined,
    pickupAddress: undefined,
    tenantId: TENANT_A,
    correlationId: CORRELATION_ID,
    countryCode: 'BR',
    timezone: 'America/Sao_Paulo',
  });

  it('creates a PENDING guest booking and saves it', async () => {
    const result = await useCase.execute(baseInput());

    expect(result.status).toBe(BookingStatus.PENDING);
    expect(result.bookingId).toBeDefined();
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].serviceId).toBe(serviceId);
    expect(result.pickupAddress).toBeNull();

    const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
    expect(saved).not.toBeNull();
    expect(saved!.type).toBe('GUEST');
    expect(saved!.customerId).toBeNull();
  });

  it('locks every referenced service (lockBookingModels) before saving the booking, closing the bookingModel/first-booking race', async () => {
    const lockBookingModelsSpy = jest.spyOn(serviceRepo, 'lockBookingModels');

    await useCase.execute(baseInput());

    expect(lockBookingModelsSpy).toHaveBeenCalledWith([serviceId], TENANT_A);
  });

  it('rejects the booking when the locked service state no longer matches the pre-transaction snapshot (concurrent modification)', async () => {
    jest
      .spyOn(serviceRepo, 'lockBookingModels')
      .mockResolvedValueOnce(new Map([[serviceId, 'SESSION']]));

    await expect(useCase.execute(baseInput())).rejects.toThrow(
      BookingServiceConcurrentModificationError,
    );
  });

  it('publishes BookingRequested event after commit', async () => {
    await useCase.execute(baseInput());
    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0].eventName).toBe('BookingRequested');
    expect((eventBus.published[0] as { tenantId: string }).tenantId).toBe(TENANT_A);
  });

  it('promotes beforeServicePhotoUrls from tmp/ to the permanent booking path', async () => {
    const tmpPath = `tmp/${TENANT_A}/upload-1/photo1.jpg`;
    storageService.markAsUploaded(tmpPath);

    const result = await useCase.execute({
      ...baseInput(),
      beforeServicePhotoUrls: [tmpPath],
    });
    const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
    expect(saved!.beforeServicePhotoUrls).toEqual([
      `tenants/${TENANT_A}/bookings/${result.bookingId}/upload-1/photo1.jpg`,
    ]);
    expect(storageService.copiedPaths).toEqual([
      {
        sourcePath: tmpPath,
        destinationPath: `tenants/${TENANT_A}/bookings/${result.bookingId}/upload-1/photo1.jpg`,
        destinationBucket: 'private',
      },
    ]);
    expect(storageService.deletedPaths).toEqual([tmpPath]);
  });

  it('throws BookingPhotoNotUploadedError when a photo path does not exist in storage', async () => {
    await expect(
      useCase.execute({
        ...baseInput(),
        beforeServicePhotoUrls: [`tmp/${TENANT_A}/upload-1/missing.jpg`],
      }),
    ).rejects.toBeInstanceOf(BookingPhotoNotUploadedError);
  });

  it('stores optional contactAddress when provided', async () => {
    const addr = {
      street: 'Rua A',
      number: '1',
      neighborhood: 'Centro',
      city: 'BH',
      state: 'MG',
      zipCode: '30100000',
    };
    const result = await useCase.execute({ ...baseInput(), contactAddress: addr });
    const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
    expect(saved!.contactAddress).not.toBeNull();
    expect(saved!.contactAddress!.city).toBe('BH');
  });

  it('translates an invalid contactAddress into BookingAddressValidationError with field=contactAddress', async () => {
    const err = await useCase
      .execute({ ...baseInput(), contactAddress: testAddressProps({ zipCode: '123' }) })
      .catch((e) => e);
    expect(err).toBeInstanceOf(BookingAddressValidationError);
    expect((err as BookingAddressValidationError).field).toBe('contactAddress');
    expect((err as BookingAddressValidationError).code).toBe(AddressErrorCode.POSTAL_CODE_INVALID);
  });

  it('translates an invalid pickupAddress into BookingAddressValidationError with field=pickupAddress', async () => {
    const pickupSvc = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withRequiresPickupAddress(true)
      .build();
    await serviceRepo.save(pickupSvc);

    const err = await useCase
      .execute({
        ...baseInput(),
        serviceIds: [pickupSvc.id],
        pickupAddress: testAddressProps({ zipCode: '123' }),
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(BookingAddressValidationError);
    expect((err as BookingAddressValidationError).field).toBe('pickupAddress');
    expect((err as BookingAddressValidationError).code).toBe(AddressErrorCode.POSTAL_CODE_INVALID);
  });

  it('stores optional notes when provided', async () => {
    const result = await useCase.execute({ ...baseInput(), notes: 'Carro está sujo de lama' });
    const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
    expect(saved!.notes).toBe('Carro está sujo de lama');
  });

  it('defaults notes to null when not provided', async () => {
    const result = await useCase.execute(baseInput());
    const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
    expect(saved!.notes).toBeNull();
  });

  it('stores pickupAddress and returns it in result', async () => {
    const pickupSvc = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withRequiresPickupAddress(true)
      .build();
    await serviceRepo.save(pickupSvc);
    const addr = testAddress();
    const result = await useCase.execute({
      ...baseInput(),
      serviceIds: [pickupSvc.id],
      pickupAddress: {
        street: addr.street,
        number: addr.number,
        neighborhood: addr.neighborhood,
        city: addr.city,
        state: addr.state,
        zipCode: addr.zipCode,
      },
    });
    expect(result.pickupAddress).not.toBeNull();
    expect(result.pickupAddress!.city).toBe(addr.city);
  });

  it('throws BookingSlotUnavailableError when approved booking overlaps the slot', async () => {
    const location = new ResourceBuilder()
      .withTenantId(TENANT_A)
      .withType(ResourceType.LOCATION)
      .build();
    await resourceRepo.save(location);
    const locationService = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.LOCATION,
          selectionMode: 'NONE',
          resourcePoolIds: [location.id],
          requiredQuantity: 1,
        }),
      ])
      .build();
    await serviceRepo.save(locationService);
    occupancyRepo.seed(TENANT_A, 'other-line-id', {
      resourceId: location.id,
      resourceType: ResourceType.LOCATION,
      resourceName: location.name,
      legIndex: null,
      quantityPosition: null,
      selectionMode: 'NONE' as const,
      isBundleMember: false,
      startsAt: new Date(`${futureDate(1)}T10:00:00.000Z`),
      endsAt: new Date(`${futureDate(1)}T10:30:00.000Z`),
    });

    await expect(
      useCase.execute({ ...baseInput(), serviceIds: [locationService.id] }),
    ).rejects.toBeInstanceOf(BookingSlotUnavailableError);
  });

  it('throws BookingServiceNotInTenantError when a serviceId is not found', async () => {
    const { BookingServiceNotInTenantError } =
      await import('../../domain/errors/booking-domain.error');
    await expect(
      useCase.execute({ ...baseInput(), serviceIds: ['00000000-0000-4000-8000-000000009999'] }),
    ).rejects.toBeInstanceOf(BookingServiceNotInTenantError);
  });

  it('throws BookingServiceNotActiveError when a service is deactivated', async () => {
    const { BookingServiceNotActiveError } =
      await import('../../domain/errors/booking-domain.error');
    const inactive = new ServiceBuilder().withTenantId(TENANT_A).build();
    inactive.deactivate();
    await serviceRepo.save(inactive);
    await expect(
      useCase.execute({ ...baseInput(), serviceIds: [inactive.id] }),
    ).rejects.toBeInstanceOf(BookingServiceNotActiveError);
  });

  it('throws BookingServiceSessionNotBookableError when the service is a SESSION service', async () => {
    const sessionService = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withBookingModel('SESSION')
      .withResourceRequirements([])
      .withBufferAfterMinutes(null)
      .withClassResourceSlots([])
      .build();
    await serviceRepo.save(sessionService);
    await expect(
      useCase.execute({ ...baseInput(), serviceIds: [sessionService.id] }),
    ).rejects.toBeInstanceOf(BookingServiceSessionNotBookableError);
  });

  it('builds lines preserving order — including duplicates', async () => {
    const result = await useCase.execute({
      ...baseInput(),
      serviceIds: [serviceId, serviceId],
    });
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].serviceId).toBe(serviceId);
    expect(result.lines[1].serviceId).toBe(serviceId);
  });

  it('result totalPrice equals sum of priceAtBooking across lines', async () => {
    const result = await useCase.execute({
      ...baseInput(),
      serviceIds: [serviceId, serviceId],
    });
    const sum = result.lines.reduce((acc, l) => acc + l.priceAtBooking.amount, 0);
    expect(result.totalPrice.amount).toBe(sum);
  });

  it('logs "Booking requested" with tenantId, bookingId, and bookingType', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();

    const result = await useCase.execute(baseInput());

    expect(logSpy).toHaveBeenCalledWith('Booking requested', {
      tenantId: TENANT_A,
      bookingId: result.bookingId,
      bookingType: 'GUEST',
    });
  });

  describe('M23-S02 — variable duration + intake', () => {
    async function saveVariableDurationService(): Promise<string> {
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withBookingPolicy({
          durationPolicy: 'CUSTOMER_SELECTED',
          durationMinMinutes: 60,
          durationMaxMinutes: 240,
          durationIncrementMinutes: 30,
          pricingPolicy: 'PER_TIME_INCREMENT',
          pricingIncrementMinutes: 60,
          pricePerIncrementAmount: 50,
          minimumChargeAmount: null,
        })
        .build();
      await serviceRepo.save(service);
      return service.id;
    }

    async function saveIntakeBearingService(): Promise<string> {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await serviceRepo.save(service);
      const schema = ServiceBookingIntakeSchema.publish({
        tenantId: TENANT_A,
        serviceId: service.id,
        previousVersion: 0,
        questions: [
          { fieldKey: 'vehiclePlate', label: 'Placa', type: 'FREE_TEXT', required: true },
        ],
        consentText: 'Aceito os termos',
        requiresNamedAttendees: false,
        participantCountRequired: false,
      });
      await intakeSchemaRepo.publish(schema);
      return service.id;
    }

    it('persists the customer-selected duration and computed quote on the line', async () => {
      const variableServiceId = await saveVariableDurationService();

      const result = await useCase.execute({
        ...baseInput(),
        serviceIds: [variableServiceId],
        durationMinutes: 90,
      });

      expect(result.lines[0].durationMinsAtBooking).toBe(90);
      // 90 minutes / 60-minute pricing increment -> rounds up to 2 increments * 50 = 100
      expect(result.lines[0].priceAtBooking.amount).toBe(100);
    });

    it('throws BookingDurationOutOfRangeError when durationMinutes is omitted for a CUSTOMER_SELECTED service', async () => {
      const variableServiceId = await saveVariableDurationService();

      await expect(
        useCase.execute({ ...baseInput(), serviceIds: [variableServiceId] }),
      ).rejects.toBeInstanceOf(BookingDurationOutOfRangeError);
    });

    it('snapshots intake answers, consent, and version on the booking', async () => {
      const intakeServiceId = await saveIntakeBearingService();

      const result = await useCase.execute({
        ...baseInput(),
        serviceIds: [intakeServiceId],
        intakeAnswers: { vehiclePlate: 'ABC1D23' },
        consentAccepted: true,
      });

      const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
      expect(saved!.intake).toEqual({
        intakeSchemaVersion: 1,
        intakeAnswers: { vehiclePlate: 'ABC1D23' },
        consentAcceptedAt: expect.any(Date),
        consentVersion: 1,
      });
    });

    it('throws BookingIntakeAnswerMissingError when a required intake answer is missing', async () => {
      const intakeServiceId = await saveIntakeBearingService();

      await expect(
        useCase.execute({
          ...baseInput(),
          serviceIds: [intakeServiceId],
          intakeAnswers: {},
          consentAccepted: true,
        }),
      ).rejects.toBeInstanceOf(BookingIntakeAnswerMissingError);
    });

    it('ignores intakeAnswers/attendees submitted for a service with no active intake schema', async () => {
      const result = await useCase.execute({
        ...baseInput(),
        intakeAnswers: { anything: 'x' },
        consentAccepted: true,
      });

      const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
      expect(saved!.intake).toBeNull();
    });

    it('throws BookingInvalidMultipleVariableServicesError when the basket has two variable services', async () => {
      const variableServiceId = await saveVariableDurationService();
      const intakeServiceId = await saveIntakeBearingService();

      await expect(
        useCase.execute({
          ...baseInput(),
          serviceIds: [variableServiceId, intakeServiceId],
          durationMinutes: 60,
        }),
      ).rejects.toBeInstanceOf(BookingInvalidMultipleVariableServicesError);
    });

    it('throws BookingInvalidMultipleVariableServicesError when the same variable service is booked twice in one basket', async () => {
      const variableServiceId = await saveVariableDurationService();

      await expect(
        useCase.execute({
          ...baseInput(),
          serviceIds: [variableServiceId, variableServiceId],
          durationMinutes: 60,
        }),
      ).rejects.toBeInstanceOf(BookingInvalidMultipleVariableServicesError);
    });

    it('stores participantCount independently of ResourceRequirement.requiredQuantity', async () => {
      const result = await useCase.execute({
        ...baseInput(),
        participantCount: 4,
      });

      const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
      expect(saved!.participantCount).toBe(4);
    });
  });
});
