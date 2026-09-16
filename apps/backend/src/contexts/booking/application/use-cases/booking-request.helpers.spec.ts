import { countrySpec } from '@ikaro/i18n';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceType } from '../../domain/resource.types';
import {
  BookingBuilder,
  BookingLineBuilder,
  ResourceBuilder,
  ServiceBuilder,
} from '../../../../test/builders/booking/index';
import { testAddressProps } from '../../../../test/utils/address-helpers';
import { futureDate } from '../../../../test/utils/date-helpers';
import { Money } from '../../../../shared/value-objects/money';
import {
  BookingAddressValidationError,
  BookingServiceConcurrentModificationError,
  BookingServiceNotInTenantError,
} from '../../domain/errors/booking-domain.error';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { PhotoExistenceService } from '../services/photo-existence.service';
import {
  buildLineInputs,
  createBookingAddress,
  persistRequestedBooking,
  toBookingResult,
} from './booking-request.helpers';

const TENANT_A = '10000000-0000-4000-8000-000000000100';
const BR_ADDRESS_SPEC = countrySpec('BR').address;

describe('createBookingAddress', () => {
  it('creates a valid address', () => {
    const address = createBookingAddress(testAddressProps(), BR_ADDRESS_SPEC, 'contactAddress');
    expect(address.street).toBe('Rua das Flores');
  });

  it('wraps an AddressValidationError into a BookingAddressValidationError tagged with the given field', () => {
    let caught: unknown;
    try {
      createBookingAddress(
        testAddressProps({ zipCode: 'not-a-zip' }),
        BR_ADDRESS_SPEC,
        'pickupAddress',
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(BookingAddressValidationError);
    expect((caught as BookingAddressValidationError).field).toBe('pickupAddress');
  });
});

describe('buildLineInputs', () => {
  it('maps each serviceId to a BookingLineInput snapshotted from the service map', () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withName('Lavagem Completa')
      .withPrice(Money.from(150, 'BRL'))
      .build();
    const serviceMap = new Map([[service.id, service]]);

    const result = buildLineInputs([service.id], serviceMap);

    expect(result).toEqual([
      {
        serviceId: service.id,
        serviceNameAtBooking: service.name,
        priceAtBooking: service.price,
        durationMinsAtBooking: service.durationMinutes,
        pointsValueAtBooking: service.loyaltyPointsValue,
        requiresPickupAddressAtBooking: service.requiresPickupAddress,
      },
    ]);
  });

  it('throws BookingServiceNotInTenantError when a serviceId is not in the map', () => {
    expect(() => buildLineInputs(['missing-service-id'], new Map())).toThrow(
      BookingServiceNotInTenantError,
    );
  });
});

describe('toBookingResult', () => {
  it('maps a Booking without a pickup address', () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withLines([new BookingLineBuilder().build()])
      .build();

    const result = toBookingResult(booking);

    expect(result.bookingId).toBe(booking.id);
    expect(result.status).toBe(booking.status);
    expect(result.pickupAddress).toBeNull();
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].serviceId).toBe(booking.lines[0].serviceId);
  });
});

describe('persistRequestedBooking', () => {
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let bookingRepo: InMemoryBookingRepository;
  let txManager: InMemoryTransactionManager;
  let slotConflictService: BookingSlotConflictService;
  let photoExistenceService: PhotoExistenceService;
  const scheduledAt = new Date(`${futureDate(1)}T10:00:00.000Z`);

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    bookingRepo = new InMemoryBookingRepository(new InMemoryEventBus());
    txManager = new InMemoryTransactionManager();
    slotConflictService = new BookingSlotConflictService(occupancyRepo, new InMemoryTenantLock());
    photoExistenceService = new PhotoExistenceService(new InMemoryStorageService());
    // M22-S03: a service with zero resourceRequirements (every fixture here, and every real
    // service until a manager explicitly configures it) falls back to the tenant's LOCATION
    // resource during write-path resolution.
    await resourceRepo.save(
      new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.LOCATION).build(),
    );
  });

  const run = async (
    booking: ReturnType<BookingBuilder['build']>,
    serviceMap: Map<string, ReturnType<ServiceBuilder['build']>>,
  ) =>
    persistRequestedBooking(
      txManager,
      slotConflictService,
      bookingRepo,
      photoExistenceService,
      serviceRepo,
      resourceRepo,
      occupancyRepo,
      new AvailabilityService(),
      {
        booking,
        tenantId: TENANT_A,
        scheduledAt,
        operations: [],
        serviceMap,
      },
    );

  it('locks every distinct service referenced by the booking lines exactly once', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    const lockBookingModelsSpy = jest.spyOn(serviceRepo, 'lockBookingModels');
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withLines([
        new BookingLineBuilder().withServiceId(service.id).build(),
        new BookingLineBuilder().withServiceId(service.id).build(),
      ])
      .build();

    await run(booking, new Map([[service.id, service]]));

    expect(lockBookingModelsSpy).toHaveBeenCalledTimes(1);
    expect(lockBookingModelsSpy).toHaveBeenCalledWith([service.id], TENANT_A);
  });

  it('saves the booking once every locked service matches its pre-transaction snapshot', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withLines([new BookingLineBuilder().withServiceId(service.id).build()])
      .build();

    await run(booking, new Map([[service.id, service]]));

    expect(await bookingRepo.findById(booking.id, TENANT_A)).not.toBeNull();
  });

  it('rejects when the locked bookingModel no longer matches the pre-transaction snapshot', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    jest
      .spyOn(serviceRepo, 'lockBookingModels')
      .mockResolvedValueOnce(new Map([[service.id, 'SESSION']]));
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withLines([new BookingLineBuilder().withServiceId(service.id).build()])
      .build();

    await expect(run(booking, new Map([[service.id, service]]))).rejects.toThrow(
      BookingServiceConcurrentModificationError,
    );
    expect(await bookingRepo.findById(booking.id, TENANT_A)).toBeNull();
  });

  it('rejects when a referenced service is missing from the locked result entirely', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    // Not saved to serviceRepo — lockBookingModels() will return an empty map for it.
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withLines([new BookingLineBuilder().withServiceId(service.id).build()])
      .build();

    await expect(run(booking, new Map([[service.id, service]]))).rejects.toThrow(
      BookingServiceConcurrentModificationError,
    );
  });
});
