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
import { ResourceRequirement } from '../../domain/resource-requirement';
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

    const result = toBookingResult(booking, new Map());

    expect(result.bookingId).toBe(booking.id);
    expect(result.status).toBe(booking.status);
    expect(result.pickupAddress).toBeNull();
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].serviceId).toBe(booking.lines[0].serviceId);
    expect(result.lines[0].assignedResourceName).toBeUndefined();
    expect(result.lines[0].itinerary).toBeUndefined();
  });

  it('reveals assignedResourceName for a flat AUTO_ANY candidate but not a pool one', () => {
    const line = new BookingLineBuilder().build();
    const booking = new BookingBuilder().withTenantId(TENANT_A).withLines([line]).build();
    const autoAnyCandidates = new Map([
      [
        line.lineId,
        {
          isDegenerate: false,
          candidates: [
            {
              resourceId: 'resource-1',
              resourceType: ResourceType.ROOM,
              resourceName: 'Ana Souza',
              legIndex: null,
              quantityPosition: null,
              startsAt: new Date(),
              endsAt: new Date(),
              selectionMode: 'AUTO_ANY' as const,
            },
          ],
        },
      ],
    ]);
    const poolCandidates = new Map([
      [
        line.lineId,
        {
          isDegenerate: false,
          candidates: [
            {
              resourceId: 'resource-2',
              resourceType: ResourceType.ROOM,
              resourceName: 'Quadra 1',
              legIndex: null,
              quantityPosition: null,
              startsAt: new Date(),
              endsAt: new Date(),
              selectionMode: 'AUTO_FUNGIBLE_POOL' as const,
            },
          ],
        },
      ],
    ]);

    expect(toBookingResult(booking, autoAnyCandidates).lines[0].assignedResourceName).toBe(
      'Ana Souza',
    );
    expect(toBookingResult(booking, poolCandidates).lines[0].assignedResourceName).toBeUndefined();
  });

  it('always reveals the full itinerary for a legged line, regardless of selectionMode', () => {
    const line = new BookingLineBuilder().build();
    const booking = new BookingBuilder().withTenantId(TENANT_A).withLines([line]).build();
    const legStart = new Date('2026-06-01T10:00:00.000Z');
    const legEnd = new Date('2026-06-01T10:20:00.000Z');
    const candidatesByLine = new Map([
      [
        line.lineId,
        {
          isDegenerate: false,
          candidates: [
            {
              resourceId: 'resource-1',
              resourceType: ResourceType.ROOM,
              resourceName: 'Sala 1',
              legIndex: 1,
              quantityPosition: null,
              startsAt: legEnd,
              endsAt: new Date(legEnd.getTime() + 20 * 60_000),
              selectionMode: 'CUSTOMER_CHOICE' as const,
            },
            {
              resourceId: 'resource-0',
              resourceType: ResourceType.EQUIPMENT,
              resourceName: 'Equipamento 1',
              legIndex: 0,
              quantityPosition: null,
              startsAt: legStart,
              endsAt: legEnd,
              selectionMode: 'AUTO_ANY' as const,
            },
          ],
        },
      ],
    ]);

    const result = toBookingResult(booking, candidatesByLine);

    expect(result.lines[0].assignedResourceName).toBeUndefined();
    expect(result.lines[0].itinerary).toEqual([
      {
        legIndex: 0,
        resourceName: 'Equipamento 1',
        startsAt: legStart.toISOString(),
        endsAt: legEnd.toISOString(),
      },
      {
        legIndex: 1,
        resourceName: 'Sala 1',
        startsAt: legEnd.toISOString(),
        endsAt: new Date(legEnd.getTime() + 20 * 60_000).toISOString(),
      },
    ]);
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
    resourceSelections: Parameters<typeof persistRequestedBooking>[1]['resourceSelections'] = [],
  ) =>
    persistRequestedBooking(
      {
        txManager,
        slotConflictService,
        bookingRepo,
        photoExistenceService,
        serviceRepo,
        resourceRepo,
        occupancyRepo,
        availabilityService: new AvailabilityService(),
      },
      {
        booking,
        tenantId: TENANT_A,
        scheduledAt,
        timezone: 'America/Sao_Paulo',
        operations: [],
        serviceMap,
        resourceSelections,
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

  it('resolves a CUSTOMER_CHOICE requirement via resourceSelections and returns it in candidatesByLine', async () => {
    const staff = new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.ROOM).build();
    await resourceRepo.save(staff);
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'CUSTOMER_CHOICE' }),
      ])
      .build();
    await serviceRepo.save(service);
    const line = new BookingLineBuilder().withServiceId(service.id).build();
    const booking = new BookingBuilder().withTenantId(TENANT_A).withLines([line]).build();

    const candidatesByLine = await run(booking, new Map([[service.id, service]]), [
      {
        serviceId: service.id,
        legIndex: null,
        resourceType: ResourceType.ROOM,
        resourceId: staff.id,
      },
    ]);

    expect(candidatesByLine.get(line.lineId)!.candidates[0].resourceId).toBe(staff.id);
  });
});
