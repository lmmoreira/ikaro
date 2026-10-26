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
import { openSlot } from '../../../../test/utils/date-helpers';
import { DEFAULT_TEST_BUSINESS_HOURS } from '../../../../test/utils/business-hours-fixtures';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import {
  BookingAddressValidationError,
  BookingServiceConcurrentModificationError,
} from '../../domain/errors/booking-domain.error';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { ScheduleClosureBuilder } from '../../../../test/builders/booking/schedule-closure.builder';
import {
  BookingOutsideBusinessHoursError,
  BookingSlotClosedError,
} from '../../domain/errors/booking-domain.error';
import { createBookingAddress, persistRequestedBooking } from './booking-request.helpers';

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

describe('persistRequestedBooking', () => {
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let bookingRepo: InMemoryBookingRepository;
  let txManager: InMemoryTransactionManager;
  let slotConflictService: BookingSlotConflictService;
  let photoExistenceService: PhotoExistenceService;
  let closureRepo: InMemoryScheduleClosureRepository;
  let openingRepo: InMemoryScheduleOpeningRepository;
  const scheduledAt = new Date(openSlot(1));

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    bookingRepo = new InMemoryBookingRepository(new InMemoryEventBus());
    txManager = new InMemoryTransactionManager();
    closureRepo = new InMemoryScheduleClosureRepository();
    openingRepo = new InMemoryScheduleOpeningRepository();
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
    occupancyLockState?: 'HOLD' | 'COMMITTED',
    startsAt: Date = scheduledAt,
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
        hoursRepos: { closureRepo, openingRepo },
      },
      {
        booking,
        tenantId: TENANT_A,
        scheduledAt: startsAt,
        timezone: 'America/Sao_Paulo',
        businessHours: DEFAULT_TEST_BUSINESS_HOURS,
        operations: [],
        serviceMap,
        resourceSelections,
        occupancyLockState,
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

  it('locks the service rows before it takes any resource lock (M23-S48)', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    const order: string[] = [];
    const lockBookingModels = serviceRepo.lockBookingModels.bind(serviceRepo);
    jest.spyOn(serviceRepo, 'lockBookingModels').mockImplementation((ids, tenantId) => {
      order.push('service-rows');
      return lockBookingModels(ids, tenantId);
    });
    jest.spyOn(slotConflictService, 'lockResources').mockImplementation(async () => {
      order.push('resource-locks');
    });
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withLines([new BookingLineBuilder().withServiceId(service.id).build()])
      .build();

    await run(booking, new Map([[service.id, service]]));

    expect(order[0]).toBe('service-rows');
    expect(order).toContain('resource-locks');
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

  describe('occupancy lock state', () => {
    const lineOf = async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await serviceRepo.save(service);
      const line = new BookingLineBuilder().withServiceId(service.id).build();
      const booking = new BookingBuilder().withTenantId(TENANT_A).withLines([line]).build();
      return { service, line, booking };
    };

    // The fixture's LOCATION-fallback service is degenerate, so its HOLD is downgraded to
    // REQUESTED (assign helper) — either way it is not the COMMITTED exclusivity an APPROVED
    // booking takes.
    it('takes a pending HOLD/REQUESTED occupancy by default — a PENDING booking awaits approval', async () => {
      const { service, line, booking } = await lineOf();

      await run(booking, new Map([[service.id, service]]));

      const rows = await occupancyRepo.findOccupancyByBookingLines(TENANT_A, [line.lineId]);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.lockState !== 'COMMITTED')).toBe(true);
    });

    it('takes a COMMITTED occupancy with no expiry when the booking starts APPROVED', async () => {
      const { service, line, booking } = await lineOf();

      await run(booking, new Map([[service.id, service]]), [], 'COMMITTED');

      const rows = await occupancyRepo.findOccupancyByBookingLines(TENANT_A, [line.lineId]);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.lockState === 'COMMITTED' && r.holdExpiresAt === null)).toBe(true);
    });
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

  describe('working hours, closures and openings (TD50)', () => {
    // 2031-03-04 is a Tuesday and 2031-03-02 a Sunday; America/Sao_Paulo is UTC-3.
    const TUESDAY_10H = new Date('2031-03-04T13:00:00.000Z');
    const SUNDAY_10H = new Date('2031-03-02T13:00:00.000Z');

    const bookingFor = async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).build();
      await serviceRepo.save(service);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withLines([new BookingLineBuilder().withServiceId(service.id).build()])
        .build();
      return { booking, serviceMap: new Map([[service.id, service]]) };
    };

    it('creates the booking inside open hours', async () => {
      const { booking, serviceMap } = await bookingFor();

      await run(booking, serviceMap, [], undefined, TUESDAY_10H);

      expect(await bookingRepo.findById(booking.id, TENANT_A)).not.toBeNull();
    });

    it('refuses a closed day and saves neither the booking nor its occupancy', async () => {
      const { booking, serviceMap } = await bookingFor();

      await expect(run(booking, serviceMap, [], undefined, SUNDAY_10H)).rejects.toBeInstanceOf(
        BookingSlotClosedError,
      );

      expect(await bookingRepo.findById(booking.id, TENANT_A)).toBeNull();
      const rows = await occupancyRepo.findOccupancyByBookingLines(TENANT_A, [
        booking.lines[0].lineId,
      ]);
      expect(rows).toHaveLength(0);
    });

    it('refuses a start outside the working hours', async () => {
      const { booking, serviceMap } = await bookingFor();

      await expect(
        run(booking, serviceMap, [], undefined, new Date('2031-03-04T23:00:00.000Z')),
      ).rejects.toBeInstanceOf(BookingOutsideBusinessHoursError);
    });

    it('reports the hours reason before the occupancy one when both apply', async () => {
      const { booking, serviceMap } = await bookingFor();
      const location = (
        await resourceRepo.findByTenant(TENANT_A, { type: ResourceType.LOCATION })
      )[0];
      occupancyRepo.seed(TENANT_A, 'other-line', {
        resourceId: location.id,
        resourceType: ResourceType.LOCATION,
        resourceName: location.name,
        legIndex: null,
        quantityPosition: null,
        selectionMode: 'NONE',
        isBundleMember: false,
        gapMinutes: null,
        gapSource: null,
        startsAt: SUNDAY_10H,
        endsAt: new Date(SUNDAY_10H.getTime() + 60 * 60_000),
      });

      await expect(run(booking, serviceMap, [], undefined, SUNDAY_10H)).rejects.toBeInstanceOf(
        BookingSlotClosedError,
      );
    });

    it('refuses a start inside a closure that was created for the tenant', async () => {
      await closureRepo.save(
        new ScheduleClosureBuilder().withTenantId(TENANT_A).withDate('2031-03-04').build(),
      );
      const { booking, serviceMap } = await bookingFor();

      await expect(run(booking, serviceMap, [], undefined, TUESDAY_10H)).rejects.toBeInstanceOf(
        BookingSlotClosedError,
      );
    });

    // A closure never reaches back to bookings that already exist: they stay as they were, and
    // nothing reads or re-validates them when a closure is created later.
    it('leaves a booking made before a closure untouched when a closure is added later', async () => {
      const { booking, serviceMap } = await bookingFor();
      await run(booking, serviceMap, [], undefined, TUESDAY_10H);
      const before = await bookingRepo.findById(booking.id, TENANT_A);

      await closureRepo.save(
        new ScheduleClosureBuilder().withTenantId(TENANT_A).withDate('2031-03-04').build(),
      );

      const after = await bookingRepo.findById(booking.id, TENANT_A);
      expect(after).toEqual(before);
      const rows = await occupancyRepo.findOccupancyByBookingLines(TENANT_A, [
        booking.lines[0].lineId,
      ]);
      expect(rows.length).toBeGreaterThan(0);
    });
  });
});
