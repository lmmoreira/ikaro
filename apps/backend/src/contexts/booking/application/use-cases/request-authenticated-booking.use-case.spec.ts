import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryTenantLocalizationPort } from '../../../../test/infrastructure/in-memory-tenant-localization.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { InMemoryBookingCustomerPort } from '../../../../test/infrastructure/in-memory-booking-customer.port';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { testAddress } from '../../../../test/utils/address-helpers';
import { futureDate } from '../../../../test/utils/date-helpers';
import {
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
    bookingRepo = new InMemoryBookingRepository();
    eventBus = new InMemoryEventBus();
    customerProfilePort = new InMemoryBookingCustomerPort();
    storageService = new InMemoryStorageService();
    const txManager = new InMemoryTransactionManager();
    const ctx = new TenantContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId(CORRELATION_ID)
      .withActorId(CUSTOMER_ID)
      .withActorType('CUSTOMER')
      .withActorRole('CUSTOMER')
      .build();

    useCase = new RequestAuthenticatedBookingUseCase(
      customerProfilePort,
      serviceRepo,
      new BookingSlotConflictService(availabilityPort, new InMemoryBookingPlatformPort()),
      new PhotoExistenceService(storageService),
      bookingRepo,
      txManager,
      eventBus,
      new InMemoryTenantLocalizationPort(),
      ctx,
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

  const baseDto = () => ({
    scheduledAt,
    serviceIds: [serviceId],
    pickupAddress: undefined,
    beforeServicePhotoUrls: undefined as string[] | undefined,
  });

  it('creates a PENDING CUSTOMER booking with customerId set', async () => {
    const result = await useCase.execute(baseDto());

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
    await useCase.execute(baseDto());

    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0].eventName).toBe('BookingRequested');
  });

  it('includes beforeServicePhotoUrls in result', async () => {
    const photoPath = `tenants/${TENANT_A}/uploads/upload-1/car.jpg`;
    storageService.markAsUploaded(photoPath);

    const result = await useCase.execute({
      ...baseDto(),
      beforeServicePhotoUrls: [photoPath],
    });

    expect(result.beforeServicePhotoUrls).toEqual([photoPath]);
  });

  it('throws BookingPhotoNotUploadedError when a photo path does not exist in storage', async () => {
    await expect(
      useCase.execute({
        ...baseDto(),
        beforeServicePhotoUrls: [`tenants/${TENANT_A}/uploads/upload-1/missing.jpg`],
      }),
    ).rejects.toBeInstanceOf(BookingPhotoNotUploadedError);
  });

  it('throws BookingCustomerNotFoundError when customer does not exist', async () => {
    const emptyPort = new InMemoryBookingCustomerPort();
    const ctx = new TenantContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId(CORRELATION_ID)
      .withActorId('00000000-0000-4000-8000-000000000999')
      .withActorType('CUSTOMER')
      .build();
    const uc = new RequestAuthenticatedBookingUseCase(
      emptyPort,
      serviceRepo,
      new BookingSlotConflictService(availabilityPort, new InMemoryBookingPlatformPort()),
      new PhotoExistenceService(storageService),
      bookingRepo,
      new InMemoryTransactionManager(),
      new InMemoryEventBus(),
      new InMemoryTenantLocalizationPort(),
      ctx,
    );

    await expect(uc.execute(baseDto())).rejects.toBeInstanceOf(BookingCustomerNotFoundError);
  });

  it('throws CustomerPhoneNotSetError when customer has no phone', async () => {
    customerProfilePort.setProfile(CUSTOMER_ID, {
      email: 'nophone@example.com',
      name: 'Sem Telefone',
      phone: null,
      defaultAddress: null,
    });

    await expect(useCase.execute(baseDto())).rejects.toBeInstanceOf(CustomerPhoneNotSetError);
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

    const result = await useCase.execute({ ...baseDto(), serviceIds: [pickupService.id] });

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
      ...baseDto(),
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

  it('throws BookingSlotUnavailableError when slot is taken', async () => {
    availabilityPort.setSlots([
      { id: 'slot-test-id', scheduledAt: new Date(scheduledAt), totalDurationMins: 60 },
    ]);

    await expect(useCase.execute(baseDto())).rejects.toBeInstanceOf(BookingSlotUnavailableError);
  });
});
