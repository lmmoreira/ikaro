import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { InMemoryBookingCustomerPort } from '../../../../test/infrastructure/in-memory-booking-customer.port';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { testAddress, testAddressProps } from '../../../../test/utils/address-helpers';
import { futureDate } from '../../../../test/utils/date-helpers';
import { AddressErrorCode } from '@ikaro/types';
import {
  BookingAddressValidationError,
  BookingCustomerNotFoundError,
  BookingPhotoNotUploadedError,
  BookingSlotUnavailableError,
  CustomerPhoneNotSetError,
} from '../../domain/errors/booking-domain.error';
import { BookingStatus } from '../../domain/booking.aggregate';
import { RequestAuthenticatedBookingUseCase } from './request-authenticated-booking.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000200';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000001';
const CORRELATION_ID = 'corr-auth-booking-test';

const scheduledAt = `${futureDate(1)}T10:00:00.000Z`;

describe('RequestAuthenticatedBookingUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let availabilityPort: InMemoryBookingAvailabilityPort;
  let bookingRepo: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;
  let customerProfilePort: InMemoryBookingCustomerPort;
  let storageService: InMemoryStorageService;
  let useCase: RequestAuthenticatedBookingUseCase;
  let serviceId: string;

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
    availabilityPort = new InMemoryBookingAvailabilityPort();
    eventBus = new InMemoryEventBus();
    bookingRepo = new InMemoryBookingRepository(eventBus);
    customerProfilePort = new InMemoryBookingCustomerPort();
    storageService = new InMemoryStorageService();
    const txManager = new InMemoryTransactionManager();

    useCase = new RequestAuthenticatedBookingUseCase(
      customerProfilePort,
      serviceRepo,
      new BookingSlotConflictService(availabilityPort),
      new PhotoExistenceService(storageService),
      bookingRepo,
      txManager,
    );

    const service = new ServiceBuilder().withTenantId(TENANT_A).withName('Lavagem Simples').build();
    await serviceRepo.save(service);
    serviceId = service.id;

    customerProfilePort.setProfile(CUSTOMER_ID, {
      email: 'cliente@example.com',
      name: 'Maria Silva',
      phone: '+5531999999999',
      defaultAddress: null,
    });
  });

  const baseInput = () => ({
    scheduledAt,
    serviceIds: [serviceId],
    pickupAddress: undefined,
    beforeServicePhotoUrls: undefined as string[] | undefined,
    tenantId: TENANT_A,
    correlationId: CORRELATION_ID,
    customerId: CUSTOMER_ID,
    countryCode: 'BR',
    timezone: 'America/Sao_Paulo',
  });

  it('creates a PENDING CUSTOMER booking with customerId set', async () => {
    const result = await useCase.execute(baseInput());

    expect(result.status).toBe(BookingStatus.PENDING);
    expect(result.bookingId).toBeDefined();
    expect(result.lines).toHaveLength(1);

    const saved = await bookingRepo.findById(result.bookingId, TENANT_A);
    expect(saved).not.toBeNull();
    expect(saved!.type).toBe('CUSTOMER');
    expect(saved!.customerId).toBe(CUSTOMER_ID);
    expect(saved!.contactEmail.address).toBe('cliente@example.com');
    expect(saved!.contactName).toBe('Maria Silva');
  });

  it('publishes BookingRequested event after commit', async () => {
    await useCase.execute(baseInput());

    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0].eventName).toBe('BookingRequested');
  });

  it('promotes beforeServicePhotoUrls from tmp/ to the permanent booking path', async () => {
    const tmpPath = `tmp/${TENANT_A}/upload-1/car.jpg`;
    storageService.markAsUploaded(tmpPath);

    const result = await useCase.execute({
      ...baseInput(),
      beforeServicePhotoUrls: [tmpPath],
    });

    const permanentPath = `tenants/${TENANT_A}/bookings/${result.bookingId}/upload-1/car.jpg`;
    expect(result.beforeServicePhotoUrls).toEqual([permanentPath]);
    // Proves the copy actually landed at the permanent path — not just that the tmp source was
    // deleted, which alone wouldn't catch a promotion that deletes without a successful copy.
    await expect(storageService.exists(permanentPath, 'private')).resolves.toBe(true);
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

  it('throws BookingCustomerNotFoundError when customer does not exist', async () => {
    const emptyPort = new InMemoryBookingCustomerPort();
    const unknownCustomerId = '00000000-0000-4000-8000-000000000999';
    const uc = new RequestAuthenticatedBookingUseCase(
      emptyPort,
      serviceRepo,
      new BookingSlotConflictService(availabilityPort),
      new PhotoExistenceService(storageService),
      bookingRepo,
      new InMemoryTransactionManager(),
    );

    await expect(
      uc.execute({ ...baseInput(), customerId: unknownCustomerId }),
    ).rejects.toBeInstanceOf(BookingCustomerNotFoundError);
  });

  it('throws CustomerPhoneNotSetError when customer has no phone', async () => {
    customerProfilePort.setProfile(CUSTOMER_ID, {
      email: 'nophone@example.com',
      name: 'Sem Telefone',
      phone: null,
      defaultAddress: null,
    });

    await expect(useCase.execute(baseInput())).rejects.toBeInstanceOf(CustomerPhoneNotSetError);
  });

  it('falls back to Customer.defaultAddress for pickupAddress when service requires pickup and body omits it', async () => {
    const pickupService = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withRequiresPickupAddress(true)
      .build();
    await serviceRepo.save(pickupService);

    const addr = testAddress();
    customerProfilePort.setProfile(CUSTOMER_ID, {
      email: 'cliente@example.com',
      name: 'Maria Silva',
      phone: '+5531999999999',
      defaultAddress: addr,
    });

    const result = await useCase.execute({ ...baseInput(), serviceIds: [pickupService.id] });

    expect(result.pickupAddress).not.toBeNull();
    expect(result.pickupAddress!.city).toBe(addr.city);
  });

  it('uses explicit pickupAddress from body over Customer.defaultAddress', async () => {
    const pickupService = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withRequiresPickupAddress(true)
      .build();
    await serviceRepo.save(pickupService);

    customerProfilePort.setProfile(CUSTOMER_ID, {
      email: 'cliente@example.com',
      name: 'Maria Silva',
      phone: '+5531999999999',
      defaultAddress: testAddress({ city: 'Uberlândia' }),
    });

    const result = await useCase.execute({
      ...baseInput(),
      serviceIds: [pickupService.id],
      pickupAddress: {
        street: 'Rua Nova',
        number: '1',
        neighborhood: 'Centro',
        city: 'Belo Horizonte',
        state: 'MG',
        zipCode: '30100000',
      },
    });

    expect(result.pickupAddress!.city).toBe('Belo Horizonte');
  });

  it('translates an invalid explicit pickupAddress into BookingAddressValidationError with field=pickupAddress', async () => {
    const pickupService = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withRequiresPickupAddress(true)
      .build();
    await serviceRepo.save(pickupService);

    const err = await useCase
      .execute({
        ...baseInput(),
        serviceIds: [pickupService.id],
        pickupAddress: testAddressProps({ zipCode: '123' }),
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(BookingAddressValidationError);
    expect((err as BookingAddressValidationError).field).toBe('pickupAddress');
    expect((err as BookingAddressValidationError).code).toBe(AddressErrorCode.POSTAL_CODE_INVALID);
  });

  it('throws BookingSlotUnavailableError when slot is taken', async () => {
    availabilityPort.setSlots([
      { id: 'slot-test-id', scheduledAt: new Date(scheduledAt), totalDurationMins: 60 },
    ]);

    await expect(useCase.execute(baseInput())).rejects.toBeInstanceOf(BookingSlotUnavailableError);
  });
});
