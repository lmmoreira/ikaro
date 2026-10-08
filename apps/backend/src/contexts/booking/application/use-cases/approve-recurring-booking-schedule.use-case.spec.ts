import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryBookingCustomerPort } from '../../../../test/infrastructure/in-memory-booking-customer.port';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import {
  ResourceBuilder,
  ScheduleClosureBuilder,
  ServiceBuilder,
} from '../../../../test/builders/booking/index';
import { addDaysUTC } from '../../../../shared/utils/calendar-date';
import { testAddress } from '../../../../test/utils/address-helpers';
import { nextWeekday } from '../../../../test/utils/date-helpers';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingScheduledInPastError,
  BookingServiceNotInTenantError,
  CustomerPhoneNotSetError,
} from '../../domain/errors/booking-domain.error';
import {
  RecurringBookingScheduleConflictError,
  RecurringBookingScheduleNotFoundError,
  RecurringBookingScheduleNotPendingApprovalError,
} from '../../domain/errors/recurring-booking-schedule.error';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ApproveRecurringBookingScheduleUseCase } from './approve-recurring-booking-schedule.use-case';

const TENANT = '10000000-0000-4000-8000-000000000400';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000401';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000002';
const STAFF_ID = '30000000-0000-4000-8000-000000000003';
const CORRELATION_ID = 'corr-approve-test';
const TIMEZONE = 'America/Sao_Paulo';
const STARTS_ON = nextWeekday(2);
const ENDS_ON = addDaysUTC(STARTS_ON, 28); // five Tuesdays, both ends included

describe('ApproveRecurringBookingScheduleUseCase', () => {
  let scheduleRepo: InMemoryRecurringBookingScheduleRepository;
  let bookingRepo: InMemoryBookingRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let closureRepo: InMemoryScheduleClosureRepository;
  let customerPort: InMemoryBookingCustomerPort;
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let eventBus: InMemoryEventBus;
  let useCase: ApproveRecurringBookingScheduleUseCase;
  let serviceId: string;
  let resourceId: string;

  function pendingSchedule(
    overrides: { assignmentPolicy?: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE' } = {},
  ): RecurringBookingSchedule {
    const policy = overrides.assignmentPolicy ?? 'FIXED_ASSIGNMENT';
    const schedule = RecurringBookingSchedule.request({
      tenantId: TENANT,
      customerId: CUSTOMER_ID,
      serviceId,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday'],
        startTime: '10:00',
        durationMinutes: 120,
      },
      startsOn: STARTS_ON,
      endsOn: ENDS_ON,
      maxTermDays: 90,
      assignmentPolicy: policy,
      resourceAssignments:
        policy === 'FIXED_ASSIGNMENT'
          ? [
              {
                resourceId,
                resourceType: ResourceType.ROOM,
                requirementId: null,
                requiredQuantityPosition: null,
              },
            ]
          : [],
      status: 'PENDING_APPROVAL',
      approvalHoldExpiresAt: new Date(Date.now() + 30 * 60_000),
      createdByStaffId: null,
      correlationId: CORRELATION_ID,
    });
    schedule.clearDomainEvents();
    scheduleRepo.seed(schedule);
    return schedule;
  }

  function approve(scheduleId: string, tenantId = TENANT) {
    return useCase.execute({
      scheduleId,
      tenantId,
      correlationId: CORRELATION_ID,
      timezone: TIMEZONE,
      actorId: STAFF_ID,
    });
  }

  beforeEach(async () => {
    eventBus = new InMemoryEventBus();
    scheduleRepo = new InMemoryRecurringBookingScheduleRepository(eventBus);
    bookingRepo = new InMemoryBookingRepository(eventBus);
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    closureRepo = new InMemoryScheduleClosureRepository();
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    customerPort = new InMemoryBookingCustomerPort();
    customerPort.setProfile(CUSTOMER_ID, {
      email: 'ana@example.com',
      name: 'Ana Souza',
      phone: '+5531999999999',
      defaultAddress: null,
    });

    const resource = new ResourceBuilder().withTenantId(TENANT).withType(ResourceType.ROOM).build();
    await resourceRepo.save(resource);
    resourceId = resource.id;
    const service = new ServiceBuilder()
      .withTenantId(TENANT)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'CUSTOMER_CHOICE' }),
      ])
      .withBookingPolicy({ recurrenceEligible: true, defaultApprovalMode: 'MANUAL_APPROVAL' })
      .build();
    await serviceRepo.save(service);
    serviceId = service.id;

    useCase = new ApproveRecurringBookingScheduleUseCase(
      scheduleRepo,
      serviceRepo,
      bookingRepo,
      customerPort,
      resourceRepo,
      occupancyRepo,
      closureRepo,
      new InMemoryScheduleOpeningRepository(),
      new InMemoryBookingPlatformPort(),
      new InMemoryTenantLock(),
      new InMemoryTransactionManager(),
      new AvailabilityService(),
    );
  });

  it('activates the schedule and materializes one APPROVED booking per occurrence', async () => {
    const schedule = pendingSchedule();

    const result = await approve(schedule.id);

    expect(result).toEqual({ id: schedule.id, status: 'ACTIVE', occurrenceCount: 5 });
    const saved = await scheduleRepo.findById(schedule.id, TENANT);
    expect(saved?.status).toBe('ACTIVE');
    expect(saved?.approvedByStaffId).toBe(STAFF_ID);
    expect(saved?.approvalHoldExpiresAt).toBeNull();
    const bookings = await bookingRepo.findAllByTenant(TENANT);
    expect(bookings).toHaveLength(5);
    expect(bookings.every((b) => b.status === BookingStatus.APPROVED)).toBe(true);
    expect(bookings.every((b) => b.recurringScheduleId === schedule.id)).toBe(true);
    expect(bookings.every((b) => b.approvedBy === STAFF_ID)).toBe(true);
  });

  it("snapshots the customer's contact details, with the default address as the contact address", async () => {
    const address = testAddress();
    customerPort.setProfile(CUSTOMER_ID, {
      email: 'ana@example.com',
      name: 'Ana Souza',
      phone: '+5531999999999',
      defaultAddress: address,
    });
    const schedule = pendingSchedule();

    await approve(schedule.id);

    const [booking] = await bookingRepo.findAllByTenant(TENANT);
    expect(booking.contactName).toBe('Ana Souza');
    expect(booking.contactEmail.address).toBe('ana@example.com');
    expect(booking.contactPhone.value).toBe('+5531999999999');
    expect(booking.contactAddress?.street).toBe(address.street);
    expect(booking.pickupAddress).toBeNull();
  });

  it('creates the occurrences APPROVED whatever the service defaultApprovalMode says', async () => {
    const schedule = pendingSchedule();

    await approve(schedule.id);

    // The fixture service is MANUAL_APPROVAL, so a one-off booking of it would be PENDING.
    const bookings = await bookingRepo.findAllByTenant(TENANT);
    expect(bookings.map((b) => b.status)).toEqual(Array(5).fill(BookingStatus.APPROVED));
  });

  it('publishes Created for the schedule and no booking events for the occurrences', async () => {
    const schedule = pendingSchedule();

    await approve(schedule.id);

    expect(eventBus.published.map((e) => e.eventName)).toEqual(['RecurringBookingScheduleCreated']);
  });

  it('materializes a RESOLVE_PER_OCCURRENCE schedule by resolving each occurrence', async () => {
    const pooled = new ServiceBuilder()
      .withTenantId(TENANT)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
      ])
      .withBookingPolicy({ recurrenceEligible: true, defaultApprovalMode: 'MANUAL_APPROVAL' })
      .build();
    await serviceRepo.save(pooled);
    serviceId = pooled.id;
    const schedule = pendingSchedule({ assignmentPolicy: 'RESOLVE_PER_OCCURRENCE' });

    const result = await approve(schedule.id);

    expect(result.occurrenceCount).toBe(5);
  });

  describe('refusals', () => {
    it('throws not-found for an unknown schedule', async () => {
      await expect(approve('00000000-0000-7000-8000-0000000000aa')).rejects.toThrow(
        RecurringBookingScheduleNotFoundError,
      );
    });

    it("never reaches another tenant's schedule", async () => {
      const schedule = pendingSchedule();

      await expect(approve(schedule.id, OTHER_TENANT)).rejects.toThrow(
        RecurringBookingScheduleNotFoundError,
      );
      expect(await bookingRepo.findAllByTenant(TENANT)).toHaveLength(0);
    });

    it('refuses a schedule that was already resolved (race: another decision won)', async () => {
      const schedule = pendingSchedule();
      await approve(schedule.id);

      await expect(approve(schedule.id)).rejects.toThrow(
        RecurringBookingScheduleNotPendingApprovalError,
      );
      expect(await bookingRepo.findAllByTenant(TENANT)).toHaveLength(5);
    });

    it('refuses a request past its hold deadline even though the expiry job has not run', async () => {
      const schedule = pendingSchedule();
      jest.useFakeTimers({ now: Date.now() + 31 * 60_000, doNotFake: ['nextTick'] });
      try {
        await expect(approve(schedule.id)).rejects.toThrow(
          RecurringBookingScheduleNotPendingApprovalError,
        );
      } finally {
        jest.useRealTimers();
      }
      expect(await bookingRepo.findAllByTenant(TENANT)).toHaveLength(0);
    });

    it('refuses the whole approval when a closure appeared while it waited, creating nothing', async () => {
      const schedule = pendingSchedule();
      const closedDay = addDaysUTC(STARTS_ON, 14);
      await closureRepo.save(
        new ScheduleClosureBuilder().withTenantId(TENANT).withDate(closedDay).build(),
      );

      const err = await approve(schedule.id).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(RecurringBookingScheduleConflictError);
      expect((err as RecurringBookingScheduleConflictError).conflicts).toEqual([
        expect.objectContaining({ reason: 'CLOSED' }),
      ]);
      expect(await bookingRepo.findAllByTenant(TENANT)).toHaveLength(0);
      // Nothing was saved, so no event reached the outbox. (The in-memory repository hands back the
      // same instance, so the persisted status is asserted in the real-Postgres integration spec.)
      expect(eventBus.published).toHaveLength(0);
    });

    it('refuses the whole approval when a slot was taken while it waited', async () => {
      const schedule = pendingSchedule();
      const taken = new Date(`${addDaysUTC(STARTS_ON, 7)}T13:00:00.000Z`); // 10:00 local
      occupancyRepo.seed(TENANT, 'other-line', {
        resourceId,
        resourceType: ResourceType.ROOM,
        resourceName: 'Sala Aurora',
        legIndex: null,
        quantityPosition: null,
        selectionMode: 'CUSTOMER_CHOICE',
        isBundleMember: false,
        gapMinutes: null,
        gapSource: null,
        startsAt: taken,
        endsAt: new Date(taken.getTime() + 60 * 60_000),
      });

      await expect(approve(schedule.id)).rejects.toThrow(RecurringBookingScheduleConflictError);
      expect(await bookingRepo.findAllByTenant(TENANT)).toHaveLength(0);
    });

    it('fails with CustomerPhoneNotSetError when the customer has no phone', async () => {
      customerPort.setProfile(CUSTOMER_ID, {
        email: 'ana@example.com',
        name: 'Ana Souza',
        phone: null,
        defaultAddress: null,
      });
      const schedule = pendingSchedule();

      await expect(approve(schedule.id)).rejects.toThrow(CustomerPhoneNotSetError);
    });

    it('throws when the service no longer exists in the tenant', async () => {
      const schedule = pendingSchedule();
      serviceRepo = new InMemoryServiceRepository();
      useCase = new ApproveRecurringBookingScheduleUseCase(
        scheduleRepo,
        serviceRepo,
        bookingRepo,
        customerPort,
        resourceRepo,
        occupancyRepo,
        closureRepo,
        new InMemoryScheduleOpeningRepository(),
        new InMemoryBookingPlatformPort(),
        new InMemoryTenantLock(),
        new InMemoryTransactionManager(),
        new AvailabilityService(),
      );

      await expect(approve(schedule.id)).rejects.toThrow(BookingServiceNotInTenantError);
    });
  });

  // M23-S35 — a request can wait for staff past some of its own occurrences; approval never books
  // one that has already started. The term is five Tuesdays (10:00 local = 13:00Z).
  describe('occurrences that started while the request waited', () => {
    const tuesday = (index: number) => addDaysUTC(STARTS_ON, 7 * index);
    const startOf = (index: number) => new Date(`${tuesday(index)}T13:00:00.000Z`);

    function freezeAt(now: Date): void {
      jest.useFakeTimers({ now, doNotFake: ['nextTick'] });
    }

    afterEach(() => jest.useRealTimers());

    it('books only the occurrences still ahead, dropping the one starting exactly now', async () => {
      freezeAt(startOf(1));
      const schedule = pendingSchedule();

      const result = await approve(schedule.id);

      expect(result.occurrenceCount).toBe(3);
      const bookings = await bookingRepo.findAllByTenant(TENANT);
      expect(bookings.map((b) => b.scheduledAt.toISOString()).sort()).toEqual([
        startOf(2).toISOString(),
        startOf(3).toISOString(),
        startOf(4).toISOString(),
      ]);
      expect((await scheduleRepo.findById(schedule.id, TENANT))?.status).toBe('ACTIVE');
    });

    it('does not let a past occurrence on a since-closed day refuse the approval', async () => {
      // The closure was added while its day was still ahead; only then does the day pass.
      await closureRepo.save(
        new ScheduleClosureBuilder().withTenantId(TENANT).withDate(tuesday(0)).build(),
      );
      freezeAt(new Date(startOf(1).getTime() + 3_600_000));
      const schedule = pendingSchedule();

      const result = await approve(schedule.id);

      expect(result.occurrenceCount).toBe(3);
    });

    it('holds a booking on the resource for each remaining occurrence, none for the dropped ones', async () => {
      freezeAt(new Date(startOf(0).getTime() + 3_600_000));
      const schedule = pendingSchedule();

      await approve(schedule.id);

      const bookings = await bookingRepo.findAllByTenant(TENANT);
      expect(bookings).toHaveLength(4);
      const held = await occupancyRepo.findActiveWindows(
        TENANT,
        [resourceId],
        new Date(startOf(0).getTime() - 86_400_000),
        new Date(startOf(4).getTime() + 86_400_000),
      );
      expect(held).toHaveLength(4);
    });

    it('refuses with BookingScheduledInPastError when every occurrence has started, leaving the request pending', async () => {
      freezeAt(new Date(startOf(4).getTime() + 3_600_000));
      const schedule = pendingSchedule();

      await expect(approve(schedule.id)).rejects.toThrow(BookingScheduledInPastError);

      expect(await bookingRepo.findAllByTenant(TENANT)).toHaveLength(0);
      expect(eventBus.published).toHaveLength(0);
    });
  });
});
