import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryScheduleTenantSettingsPort } from '../../../../test/infrastructure/in-memory-schedule-tenant-settings';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { InMemoryCustomerProfilePort } from '../../../../test/infrastructure/in-memory-customer-profile.port';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { testAddress } from '../../../../test/utils/address-helpers';
import { futureDate } from '../../../../test/utils/date-helpers';
import {
  BookingCustomerNotFoundError,
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
  let customerProfilePort: InMemoryCustomerProfilePort;
  let useCase: RequestAuthenticatedBookingUseCase;
  let serviceId: string;

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
    availabilityPort = new InMemoryBookingAvailabilityPort();
    bookingRepo = new InMemoryBookingRepository();
    eventBus = new InMemoryEventBus();
    customerProfilePort = new InMemoryCustomerProfilePort();
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
      new BookingSlotConflictService(availabilityPort, new InMemoryScheduleTenantSettingsPort()),
      bookingRepo,
      txManager,
      eventBus,
      ctx,
    );

    const service = new ServiceBuilder().withTenantId(TENANT_A).withName('Lavagem Simples').build();
    await serviceRepo.save(service);
    serviceId = service.id;

    customerProfilePort.setProfile(CUSTOMER_ID, {
      email: 'cliente@example.com',
      name: 'Maria Silva',
      phone: '31999999999',
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
    const result = await useCase.execute({
      ...baseDto(),
      beforeServicePhotoUrls: ['https://s3.example.com/car.jpg'],
    });

    expect(result.beforeServicePhotoUrls).toEqual(['https://s3.example.com/car.jpg']);
  });

  it('throws BookingCustomerNotFoundError when customer does not exist', async () => {
    const emptyPort = new InMemoryCustomerProfilePort();
    const ctx = new TenantContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId(CORRELATION_ID)
      .withActorId('00000000-0000-4000-8000-000000000999')
      .withActorType('CUSTOMER')
      .build();
    const uc = new RequestAuthenticatedBookingUseCase(
      emptyPort,
      serviceRepo,
      new BookingSlotConflictService(availabilityPort, new InMemoryScheduleTenantSettingsPort()),
      bookingRepo,
      new InMemoryTransactionManager(),
      new InMemoryEventBus(),
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
      phone: '31999999999',
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
      phone: '31999999999',
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
