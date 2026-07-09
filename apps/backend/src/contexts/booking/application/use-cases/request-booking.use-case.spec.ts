import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { testAddress } from '../../../../test/utils/address-helpers';
import { futureDate } from '../../../../test/utils/date-helpers';
import {
  BookingPhotoNotUploadedError,
  BookingSlotUnavailableError,
} from '../../domain/errors/booking-domain.error';
import { BookingStatus } from '../../domain/booking.aggregate';
import { RequestBookingUseCase } from './request-booking.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000100';
const CORRELATION_ID = 'corr-request-booking-test';

const scheduledAt = `${futureDate(1)}T10:00:00.000Z`;

describe('RequestBookingUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let availabilityPort: InMemoryBookingAvailabilityPort;
  let bookingRepo: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;
  let storageService: InMemoryStorageService;
  let useCase: RequestBookingUseCase;
  let serviceId: string;

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
    availabilityPort = new InMemoryBookingAvailabilityPort();
    bookingRepo = new InMemoryBookingRepository();
    eventBus = new InMemoryEventBus();
    storageService = new InMemoryStorageService();
    const txManager = new InMemoryTransactionManager();
    useCase = new RequestBookingUseCase(
      serviceRepo,
      new BookingSlotConflictService(availabilityPort),
      new PhotoExistenceService(storageService),
      bookingRepo,
      txManager,
      eventBus,
    );
    const service = new ServiceBuilder().withTenantId(TENANT_A).withName('Lavagem Simples').build();
    await serviceRepo.save(service);
    serviceId = service.id;
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
      `tenants/${TENANT_A}/bookings/${result.bookingId}/photo1.jpg`,
    ]);
    expect(storageService.copiedPaths).toEqual([
      {
        sourcePath: tmpPath,
        destinationPath: `tenants/${TENANT_A}/bookings/${result.bookingId}/photo1.jpg`,
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
    const svcDuration = 30;
    availabilityPort.setSlots([
      {
        id: 'slot-test-id',
        scheduledAt: new Date(`${futureDate(1)}T10:00:00.000Z`),
        totalDurationMins: svcDuration,
      },
    ]);

    await expect(useCase.execute(baseInput())).rejects.toBeInstanceOf(BookingSlotUnavailableError);
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
});
