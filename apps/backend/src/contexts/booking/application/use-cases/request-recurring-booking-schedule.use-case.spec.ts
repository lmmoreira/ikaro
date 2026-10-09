import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryBookingCustomerPort } from '../../../../test/infrastructure/in-memory-booking-customer.port';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryBookingStaffPort } from '../../../../test/infrastructure/in-memory-booking-staff.port';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import {
  ResourceBuilder,
  ScheduleClosureBuilder,
  ScheduleOpeningBuilder,
  ServiceBuilder,
} from '../../../../test/builders/booking/index';
import { addDaysUTC } from '../../../../shared/utils/calendar-date';
import {
  EMPTY_BUSINESS_HOURS,
  FULL_WEEK_BUSINESS_HOURS,
} from '../../../../test/utils/business-hours-fixtures';
import { futureDate, nextWeekday, pastDate } from '../../../../test/utils/date-helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import {
  RecurringBookingScheduleCapReachedError,
  RecurringBookingScheduleConflictError,
  RecurringBookingScheduleIneligibleServiceError,
  RecurringBookingScheduleInvalidDateRangeError,
  RecurringBookingScheduleNoOccurrencesError,
  RecurringBookingScheduleNotFoundError,
  RecurringBookingScheduleTermExceededError,
} from '../../domain/errors/recurring-booking-schedule.error';
import {
  BookingScheduledInPastError,
  BookingServiceNotInTenantError,
  BookingTooFarAheadError,
  BookingTooSoonError,
  CustomerPhoneNotSetError,
} from '../../domain/errors/booking-domain.error';
import { RequestRecurringBookingScheduleUseCase } from './request-recurring-booking-schedule.use-case';

const TENANT = '10000000-0000-4000-8000-000000000300';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000002';
const STAFF_ID = '30000000-0000-4000-8000-000000000003';
const CORRELATION_ID = 'corr-recurring-test';
const TIMEZONE = 'America/Sao_Paulo';
// Wide open: the platform defaults, so the existing fixtures are not what the window rejects.
const TENANT_WINDOW = { minBookingAdvanceHours: 0, maxBookingAdvanceDays: 90 };

// Every fixture recurs every Tuesday, starting on the next real Tuesday from "today" — never a
// hardcoded calendar date (docs/ENGINEERING_RULES_TESTING.md § Shared test-builder date defaults).
const STARTS_ON = nextWeekday(2);
// A four-week term — well inside the 90-day default maximum.
const ENDS_ON = addDaysUTC(STARTS_ON, 28);

describe('RequestRecurringBookingScheduleUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let closureRepo: InMemoryScheduleClosureRepository;
  let openingRepo: InMemoryScheduleOpeningRepository;
  let scheduleRepo: InMemoryRecurringBookingScheduleRepository;
  let bookingRepo: InMemoryBookingRepository;
  let customerPort: InMemoryBookingCustomerPort;
  let staffPort: InMemoryBookingStaffPort;
  let platformPort: InMemoryBookingPlatformPort;
  let eventBus: InMemoryEventBus;
  let useCase: RequestRecurringBookingScheduleUseCase;
  let resourceId: string;

  async function seedService(
    overrides: {
      recurrenceEligible?: boolean;
      bookingModel?: 'APPOINTMENT' | 'SESSION';
      resourceRequirements?: ResourceRequirement[];
      defaultApprovalMode?: 'AUTO_CONFIRM' | 'MANUAL_APPROVAL';
      recurringHorizonDays?: number | null;
      requiresPickupAddress?: boolean;
      maxBookingAdvanceDaysOverride?: number;
    } = {},
  ): Promise<string> {
    const service = new ServiceBuilder()
      .withTenantId(TENANT)
      .withName('Sala Aurora')
      .withBookingModel(overrides.bookingModel ?? 'APPOINTMENT')
      .withRequiresPickupAddress(overrides.requiresPickupAddress ?? false)
      .withResourceRequirements(
        overrides.resourceRequirements ?? [
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'CUSTOMER_CHOICE' }),
        ],
      )
      .withBookingPolicy({
        recurrenceEligible: overrides.recurrenceEligible ?? true,
        defaultApprovalMode: overrides.defaultApprovalMode ?? 'AUTO_CONFIRM',
        recurringHorizonDays: overrides.recurringHorizonDays ?? null,
        maxBookingAdvanceDaysOverride: overrides.maxBookingAdvanceDaysOverride ?? null,
      })
      .build();
    await serviceRepo.save(service);
    return service.id;
  }

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    closureRepo = new InMemoryScheduleClosureRepository();
    openingRepo = new InMemoryScheduleOpeningRepository();
    customerPort = new InMemoryBookingCustomerPort();
    staffPort = new InMemoryBookingStaffPort();
    platformPort = new InMemoryBookingPlatformPort();
    eventBus = new InMemoryEventBus();
    scheduleRepo = new InMemoryRecurringBookingScheduleRepository(eventBus);
    bookingRepo = new InMemoryBookingRepository();

    const resource = new ResourceBuilder().withTenantId(TENANT).withType(ResourceType.ROOM).build();
    await resourceRepo.save(resource);
    resourceId = resource.id;

    customerPort.setProfile(CUSTOMER_ID, {
      email: 'ana@example.com',
      name: 'Ana Souza',
      phone: '+5531999999999',
      defaultAddress: null,
    });
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });

    useCase = new RequestRecurringBookingScheduleUseCase(
      serviceRepo,
      scheduleRepo,
      resourceRepo,
      bookingRepo,
      occupancyRepo,
      closureRepo,
      openingRepo,
      customerPort,
      staffPort,
      platformPort,
      new InMemoryTenantLock(),
      new InMemoryTransactionManager(),
      new AvailabilityService(),
    );
  });

  it('creates an ACTIVE schedule for an AUTO_CONFIRM service (FIXED_ASSIGNMENT)', async () => {
    const serviceId = await seedService();

    const result = await useCase.execute({
      tenantId: TENANT,
      tenantBookingWindow: TENANT_WINDOW,
      correlationId: CORRELATION_ID,
      timezone: TIMEZONE,
      serviceId,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday'],
        startTime: '10:00',
        durationMinutes: 120,
      },
      startsOn: STARTS_ON,
      endsOn: ENDS_ON,
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      resourceIds: [resourceId],
      actorType: 'CUSTOMER',
      actorId: CUSTOMER_ID,
    });

    expect(result.status).toBe('ACTIVE');
    expect(result.approvalHoldExpiresAt).toBeNull();
    const saved = await scheduleRepo.findById(result.id, TENANT);
    expect(saved?.resourceAssignments).toHaveLength(1);
    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0].eventName).toBe('RecurringBookingScheduleCreated');
  });

  it('creates a PENDING_APPROVAL schedule for a MANUAL_APPROVAL service', async () => {
    const serviceId = await seedService({ defaultApprovalMode: 'MANUAL_APPROVAL' });

    const result = await useCase.execute({
      tenantId: TENANT,
      tenantBookingWindow: TENANT_WINDOW,
      correlationId: CORRELATION_ID,
      timezone: TIMEZONE,
      serviceId,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday'],
        startTime: '10:00',
        durationMinutes: 120,
      },
      startsOn: STARTS_ON,
      endsOn: ENDS_ON,
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      resourceIds: [resourceId],
      actorType: 'CUSTOMER',
      actorId: CUSTOMER_ID,
    });

    expect(result.status).toBe('PENDING_APPROVAL');
    expect(result.approvalHoldExpiresAt).not.toBeNull();
    expect(eventBus.published[0].eventName).toBe('RecurringBookingScheduleApprovalRequested');
  });

  it('allows staff to create a schedule on the customer’s behalf', async () => {
    const serviceId = await seedService();

    const result = await useCase.execute({
      tenantId: TENANT,
      tenantBookingWindow: TENANT_WINDOW,
      correlationId: CORRELATION_ID,
      timezone: TIMEZONE,
      serviceId,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday'],
        startTime: '10:00',
        durationMinutes: 120,
      },
      startsOn: STARTS_ON,
      endsOn: ENDS_ON,
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      resourceIds: [resourceId],
      actorType: 'STAFF',
      actorId: STAFF_ID,
      bodyCustomerId: CUSTOMER_ID,
    });

    const saved = await scheduleRepo.findById(result.id, TENANT);
    expect(saved?.customerId).toBe(CUSTOMER_ID);
    expect(saved?.createdByStaffId).toBe(STAFF_ID);
  });

  it('rejects a future pattern conflict before either status branch commits', async () => {
    const serviceId = await seedService();
    const conflictStart = new Date(`${STARTS_ON}T13:00:00.000Z`); // 10:00 local (UTC-3)
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
      startsAt: conflictStart,
      endsAt: new Date(conflictStart.getTime() + 60 * 60_000),
    });

    await expect(
      useCase.execute({
        tenantId: TENANT,
        tenantBookingWindow: TENANT_WINDOW,
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 120,
        },
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(RecurringBookingScheduleConflictError);

    expect(
      (await scheduleRepo.findAllByTenantPaginated(TENANT, { limit: 100, offset: 0 })).total,
    ).toBe(0);
  });

  it('rejects past the 50-per-resource FIXED_ASSIGNMENT cap', async () => {
    const serviceId = await seedService();
    for (let i = 0; i < 50; i++) {
      scheduleRepo.seed(
        RecurringBookingSchedule.request({
          tenantId: TENANT,
          customerId: CUSTOMER_ID,
          serviceId,
          recurrence: {
            frequency: 'WEEKLY',
            daysOfWeek: ['monday'],
            startTime: '08:00',
            durationMinutes: 60,
          },
          startsOn: futureDate(200 + i),
          endsOn: futureDate(210 + i),
          maxTermDays: 90,
          assignmentPolicy: 'FIXED_ASSIGNMENT',
          resourceAssignments: [
            {
              resourceId,
              resourceType: ResourceType.ROOM,
              requirementId: null,
              requiredQuantityPosition: null,
            },
          ],
          status: 'ACTIVE',
          approvalHoldExpiresAt: null,
          createdByStaffId: null,
          correlationId: CORRELATION_ID,
        }),
      );
    }

    await expect(
      useCase.execute({
        tenantId: TENANT,
        tenantBookingWindow: TENANT_WINDOW,
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 120,
        },
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(RecurringBookingScheduleCapReachedError);
  });

  it('rejects a service that does not have recurrence enabled', async () => {
    const serviceId = await seedService({ recurrenceEligible: false });

    await expect(
      useCase.execute({
        tenantId: TENANT,
        tenantBookingWindow: TENANT_WINDOW,
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 120,
        },
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(RecurringBookingScheduleIneligibleServiceError);
  });

  it('rejects a service that requires a pickup address, since a recurring request carries none', async () => {
    const serviceId = await seedService({ requiresPickupAddress: true });

    await expect(
      useCase.execute({
        tenantId: TENANT,
        tenantBookingWindow: TENANT_WINDOW,
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 120,
        },
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(RecurringBookingScheduleIneligibleServiceError);
    expect(await bookingRepo.findAllByTenant(TENANT)).toHaveLength(0);
  });

  it('rejects a bundle (2+ resourceRequirements) service', async () => {
    const serviceId = await seedService({
      resourceRequirements: [
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'CUSTOMER_CHOICE' }),
        ResourceRequirement.create({ type: ResourceType.EQUIPMENT, selectionMode: 'AUTO_ANY' }),
      ],
    });

    await expect(
      useCase.execute({
        tenantId: TENANT,
        tenantBookingWindow: TENANT_WINDOW,
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 120,
        },
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(RecurringBookingScheduleIneligibleServiceError);
  });

  it('creates zero resource assignments for RESOLVE_PER_OCCURRENCE', async () => {
    const serviceId = await seedService({
      resourceRequirements: [
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
      ],
    });

    const result = await useCase.execute({
      tenantId: TENANT,
      tenantBookingWindow: TENANT_WINDOW,
      correlationId: CORRELATION_ID,
      timezone: TIMEZONE,
      serviceId,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday'],
        startTime: '10:00',
        durationMinutes: 120,
      },
      startsOn: STARTS_ON,
      endsOn: ENDS_ON,
      assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
      resourceIds: [],
      actorType: 'CUSTOMER',
      actorId: CUSTOMER_ID,
    });

    const saved = await scheduleRepo.findById(result.id, TENANT);
    expect(saved?.resourceAssignments).toEqual([]);
  });

  it('rejects a serviceId that belongs to a different tenant', async () => {
    const otherTenantServiceId = await seedService();
    // seedService() always writes under TENANT — reuse the id but call execute() with a
    // different tenantId to simulate a cross-tenant lookup miss.
    await expect(
      useCase.execute({
        tenantId: '10000000-0000-4000-8000-000000000999',
        tenantBookingWindow: TENANT_WINDOW,
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId: otherTenantServiceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 120,
        },
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(BookingServiceNotInTenantError);
  });

  // M23-S05: every occurrence of the term is materialized, so a second recurring pattern on the
  // same resource collides with real occupancy rows and is reported in the one conflicts list.
  describe('materialization', () => {
    function requestOn(
      serviceId: string,
      startTime: string,
      durationMinutes: number,
      overrides: Record<string, unknown> = {},
    ) {
      return useCase.execute({
        tenantId: TENANT,
        tenantBookingWindow: TENANT_WINDOW,
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId,
        recurrence: { frequency: 'WEEKLY', daysOfWeek: ['tuesday'], startTime, durationMinutes },
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
        ...overrides,
      });
    }

    it('an AUTO_CONFIRM schedule materializes one APPROVED linked booking per occurrence', async () => {
      const serviceId = await seedService();

      const result = await requestOn(serviceId, '10:00', 120);

      const bookings = await bookingRepo.findAllByTenant(TENANT);
      expect(bookings).toHaveLength(5); // four weeks inclusive of both ends
      expect(bookings.every((b) => b.status === 'APPROVED')).toBe(true);
      expect(bookings.every((b) => b.recurringScheduleId === result.id)).toBe(true);
      expect(bookings.every((b) => b.approvedBy === null)).toBe(true);
      expect(bookings.every((b) => b.customerId === CUSTOMER_ID)).toBe(true);
      expect(bookings.every((b) => b.lines[0].durationMinsAtBooking === 120)).toBe(true);
    });

    it('raises no booking events for the materialized occurrences', async () => {
      const serviceId = await seedService();

      await requestOn(serviceId, '10:00', 120);

      expect(eventBus.published.map((e) => e.eventName)).toEqual([
        'RecurringBookingScheduleCreated',
      ]);
    });

    it('a MANUAL_APPROVAL schedule materializes nothing until it is approved', async () => {
      const serviceId = await seedService({ defaultApprovalMode: 'MANUAL_APPROVAL' });

      await requestOn(serviceId, '10:00', 120);

      expect(await bookingRepo.findAllByTenant(TENANT)).toHaveLength(0);
    });

    it('a second pattern overlapping the first is refused with OCCUPIED occurrences', async () => {
      const serviceId = await seedService();
      await requestOn(serviceId, '10:00', 120);

      await expect(requestOn(serviceId, '10:30', 60)).rejects.toMatchObject({
        conflicts: expect.arrayContaining([expect.objectContaining({ reason: 'OCCUPIED' })]),
      });
      expect(await bookingRepo.findAllByTenant(TENANT)).toHaveLength(5);
    });

    it('a second pattern on the same resource at a non-overlapping time is accepted', async () => {
      const serviceId = await seedService();
      await requestOn(serviceId, '09:00', 60);

      const result = await requestOn(serviceId, '11:00', 60);

      expect(result.status).toBe('ACTIVE');
      expect(await bookingRepo.findAllByTenant(TENANT)).toHaveLength(10);
    });

    it('creates nothing, schedule included, when the customer has no phone', async () => {
      const serviceId = await seedService();
      customerPort.setProfile(CUSTOMER_ID, {
        email: 'ana@example.com',
        name: 'Ana Souza',
        phone: null,
        defaultAddress: null,
      });

      await expect(requestOn(serviceId, '10:00', 120)).rejects.toThrow(CustomerPhoneNotSetError);
    });
  });

  // M23-S18 — a schedule is a fixed term, and every occurrence of it is checked at creation.
  describe('fixed term and creation-time hours and closures', () => {
    function request(serviceId: string, overrides: Record<string, unknown> = {}) {
      return useCase.execute({
        tenantId: TENANT,
        tenantBookingWindow: TENANT_WINDOW,
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 120,
        },
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
        ...overrides,
      });
    }

    async function scheduleCount(): Promise<number> {
      return (await scheduleRepo.findAllByTenantPaginated(TENANT, { limit: 100, offset: 0 })).total;
    }

    // 10:00 local (UTC-3) on the tenant-local date.
    const occurrenceAt = (date: string) => new Date(`${date}T13:00:00.000Z`);

    describe('the term', () => {
      it('rejects an endsOn before startsOn and creates nothing', async () => {
        const serviceId = await seedService();

        await expect(request(serviceId, { startsOn: ENDS_ON, endsOn: STARTS_ON })).rejects.toThrow(
          RecurringBookingScheduleInvalidDateRangeError,
        );
        expect(await scheduleCount()).toBe(0);
      });

      it('rejects an endsOn one day past the default 90-day maximum term and names the limit', async () => {
        const serviceId = await seedService();

        await expect(
          request(serviceId, { endsOn: addDaysUTC(STARTS_ON, 91) }),
        ).rejects.toMatchObject({
          name: 'RecurringBookingScheduleTermExceededError',
          params: { maxTermDays: 90, latestEndsOn: addDaysUTC(STARTS_ON, 90) },
        });
        expect(await scheduleCount()).toBe(0);
      });

      it('accepts an endsOn exactly at the maximum term', async () => {
        const serviceId = await seedService();

        const result = await request(serviceId, { endsOn: addDaysUTC(STARTS_ON, 90) });

        expect(result.status).toBe('ACTIVE');
      });

      it('accepts an endsOn equal to startsOn', async () => {
        const serviceId = await seedService();

        const result = await request(serviceId, { endsOn: STARTS_ON });

        expect(result.status).toBe('ACTIVE');
      });

      it("uses the service's own recurringHorizonDays as the maximum term", async () => {
        const serviceId = await seedService({ recurringHorizonDays: 28 });

        await expect(
          request(serviceId, { endsOn: addDaysUTC(STARTS_ON, 29) }),
        ).rejects.toBeInstanceOf(RecurringBookingScheduleTermExceededError);
        await expect(
          request(serviceId, { endsOn: addDaysUTC(STARTS_ON, 28) }),
        ).resolves.toMatchObject({ status: 'ACTIVE' });
      });

      it('carries endsOn in the published event payload', async () => {
        const serviceId = await seedService();

        await request(serviceId);

        expect(eventBus.published[0].data).toMatchObject({ endsOn: ENDS_ON });
      });
    });

    describe('hours, closures and occupancy', () => {
      it('rejects the whole request when a closure falls on one occurrence, listing it as CLOSED', async () => {
        const serviceId = await seedService();
        const closedDate = addDaysUTC(STARTS_ON, 14);
        await closureRepo.save(
          new ScheduleClosureBuilder().withTenantId(TENANT).withDate(closedDate).build(),
        );

        await expect(request(serviceId)).rejects.toMatchObject({
          name: 'RecurringBookingScheduleConflictError',
          conflicts: [{ occurrenceStart: occurrenceAt(closedDate), reason: 'CLOSED' }],
        });
        expect(await scheduleCount()).toBe(0);
        expect(eventBus.published).toHaveLength(0);
      });

      it('accepts the same request when the closure is on a day with no occurrence', async () => {
        const serviceId = await seedService();
        await closureRepo.save(
          new ScheduleClosureBuilder()
            .withTenantId(TENANT)
            .withDate(addDaysUTC(STARTS_ON, 15))
            .build(),
        );

        await expect(request(serviceId)).resolves.toMatchObject({ status: 'ACTIVE' });
      });

      it('rejects with OUTSIDE_HOURS when the tenant hours are narrower than the requested time', async () => {
        const serviceId = await seedService();
        platformPort.seedBusinessHoursAndLocale(TENANT, {
          locale: 'pt-BR',
          businessHours: {
            ...FULL_WEEK_BUSINESS_HOURS,
            tuesday: { open: '13:00', close: '18:00' },
          },
        });

        const error = await request(serviceId).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(RecurringBookingScheduleConflictError);
        const { conflicts } = error as RecurringBookingScheduleConflictError;
        expect(conflicts).toHaveLength(5); // Tuesdays at +0, +7, +14, +21 and +28 days
        expect(new Set(conflicts.map((c) => c.reason))).toEqual(new Set(['OUTSIDE_HOURS']));
      });

      it('lists a closure and an existing booking together in one refusal', async () => {
        const serviceId = await seedService();
        const closedDate = addDaysUTC(STARTS_ON, 7);
        const bookedDate = addDaysUTC(STARTS_ON, 21);
        await closureRepo.save(
          new ScheduleClosureBuilder().withTenantId(TENANT).withDate(closedDate).build(),
        );
        const bookedStart = occurrenceAt(bookedDate);
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
          startsAt: bookedStart,
          endsAt: new Date(bookedStart.getTime() + 60 * 60_000),
        });

        await expect(request(serviceId)).rejects.toMatchObject({
          conflicts: [
            { occurrenceStart: occurrenceAt(closedDate), reason: 'CLOSED' },
            { occurrenceStart: bookedStart, reason: 'OCCUPIED' },
          ],
        });
        expect(await scheduleCount()).toBe(0);
      });

      it("never lets another tenant's closure affect the request", async () => {
        const serviceId = await seedService();
        await closureRepo.save(
          new ScheduleClosureBuilder()
            .withTenantId('10000000-0000-4000-8000-000000000998')
            .withDate(addDaysUTC(STARTS_ON, 14))
            .build(),
        );

        await expect(request(serviceId)).resolves.toMatchObject({ status: 'ACTIVE' });
      });

      it("never lets another tenant's openings or business hours affect the request", async () => {
        const otherTenantId = '10000000-0000-4000-8000-000000000998';
        const serviceId = await seedService();
        // The fixture discriminates in both directions: the request's own tenant is closed every
        // day, the other tenant is open every weekday and also has an all-day opening on the first
        // date. If either the other tenant's hours or its opening leaked into the check, an
        // occurrence would be accepted and fewer than five would be refused.
        platformPort.seedBusinessHoursAndLocale(TENANT, {
          locale: 'pt-BR',
          businessHours: EMPTY_BUSINESS_HOURS,
        });
        platformPort.seedBusinessHoursAndLocale(otherTenantId, {
          locale: 'pt-BR',
          businessHours: FULL_WEEK_BUSINESS_HOURS,
        });
        await openingRepo.save(
          new ScheduleOpeningBuilder()
            .withTenantId(otherTenantId)
            .withDate(STARTS_ON)
            .withStartTime('00:00')
            .withEndTime('23:59')
            .build(),
        );

        const error = await request(serviceId).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(RecurringBookingScheduleConflictError);
        const { conflicts } = error as RecurringBookingScheduleConflictError;
        expect(conflicts).toHaveLength(5); // Tuesdays at +0, +7, +14, +21 and +28 days
        expect(conflicts.every((c) => c.reason === 'CLOSED')).toBe(true);
      });

      it('refuses a MANUAL_APPROVAL request on a closure too, creating nothing', async () => {
        const serviceId = await seedService({ defaultApprovalMode: 'MANUAL_APPROVAL' });
        await closureRepo.save(
          new ScheduleClosureBuilder().withTenantId(TENANT).withDate(STARTS_ON).build(),
        );

        await expect(request(serviceId)).rejects.toBeInstanceOf(
          RecurringBookingScheduleConflictError,
        );
        expect(await scheduleCount()).toBe(0);
      });
    });
  });

  // M23-S35 — where a schedule starts: the booking window on the first occurrence, renewals, and
  // never a booking in the past. The fixtures recur every Tuesday at 10:00 local; STARTS_ON is the
  // next Tuesday, one to seven days ahead.
  describe('where the schedule starts', () => {
    type Input = Parameters<RequestRecurringBookingScheduleUseCase['execute']>[0];
    const EVERY_DAY = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ] as const;
    const TUESDAY_10_LOCAL = {
      frequency: 'WEEKLY' as const,
      daysOfWeek: ['tuesday' as const],
      startTime: '10:00',
      durationMinutes: 120,
    };
    const STRICT_NOTICE = { minBookingAdvanceHours: 24 * 10, maxBookingAdvanceDays: 90 };
    const OTHER_CUSTOMER_ID = '20000000-0000-4000-8000-000000000077';

    function input(serviceId: string, overrides: Partial<Input> = {}): Input {
      return {
        tenantId: TENANT,
        tenantBookingWindow: TENANT_WINDOW,
        correlationId: CORRELATION_ID,
        timezone: TIMEZONE,
        serviceId,
        recurrence: TUESDAY_10_LOCAL,
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        actorType: 'CUSTOMER',
        actorId: CUSTOMER_ID,
        ...overrides,
      };
    }

    // A previous schedule of `customerId` that ended the day before STARTS_ON unless told otherwise.
    function seedPrevious(
      serviceId: string,
      overrides: { customerId?: string; endsOn?: string; durationMinutes?: number } = {},
    ): string {
      const previous = RecurringBookingSchedule.request({
        tenantId: TENANT,
        customerId: overrides.customerId ?? CUSTOMER_ID,
        serviceId,
        recurrence: { ...TUESDAY_10_LOCAL, durationMinutes: overrides.durationMinutes ?? 120 },
        startsOn: addDaysUTC(STARTS_ON, -28),
        endsOn: overrides.endsOn ?? addDaysUTC(STARTS_ON, -1),
        maxTermDays: 90,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceAssignments: [
          {
            resourceId,
            resourceType: ResourceType.ROOM,
            requirementId: null,
            requiredQuantityPosition: null,
          },
        ],
        status: 'ACTIVE',
        approvalHoldExpiresAt: null,
        createdByStaffId: null,
        correlationId: CORRELATION_ID,
      });
      previous.clearDomainEvents();
      scheduleRepo.seed(previous);
      return previous.id;
    }

    afterEach(() => jest.useRealTimers());

    it('refuses a term whose chosen weekdays never occur in it, creating nothing', async () => {
      const serviceId = await seedService();
      const wednesday = nextWeekday(3);

      await expect(
        useCase.execute(input(serviceId, { startsOn: wednesday, endsOn: wednesday })),
      ).rejects.toThrow(RecurringBookingScheduleNoOccurrencesError);

      expect(await bookingRepo.findAllByTenant(TENANT)).toHaveLength(0);
    });

    it('refuses a customer whose first occurrence has already started', async () => {
      const serviceId = await seedService();

      await expect(
        useCase.execute(
          input(serviceId, {
            recurrence: { ...TUESDAY_10_LOCAL, daysOfWeek: [...EVERY_DAY] },
            startsOn: pastDate(5),
            endsOn: futureDate(10),
          }),
        ),
      ).rejects.toThrow(BookingScheduledInPastError);
    });

    it('refuses a customer whose first occurrence is inside the minimum notice', async () => {
      const serviceId = await seedService();

      await expect(
        useCase.execute(input(serviceId, { tenantBookingWindow: STRICT_NOTICE })),
      ).rejects.toThrow(BookingTooSoonError);
    });

    it('refuses a customer whose first occurrence is beyond the maximum days ahead', async () => {
      const serviceId = await seedService();

      await expect(
        useCase.execute(
          input(serviceId, {
            tenantBookingWindow: { minBookingAdvanceHours: 0, maxBookingAdvanceDays: 1 },
          }),
        ),
      ).rejects.toThrow(BookingTooFarAheadError);
    });

    it('lets a later occurrence run past the maximum days ahead — only the first is checked', async () => {
      const serviceId = await seedService({ recurringHorizonDays: 120 });

      const result = await useCase.execute(
        input(serviceId, {
          tenantBookingWindow: { minBookingAdvanceHours: 0, maxBookingAdvanceDays: 14 },
          endsOn: addDaysUTC(STARTS_ON, 90),
        }),
      );

      expect(result.status).toBe('ACTIVE');
    });

    it('applies a service override that is tighter than the tenant window', async () => {
      const serviceId = await seedService({ maxBookingAdvanceDaysOverride: 1 });

      await expect(useCase.execute(input(serviceId))).rejects.toThrow(BookingTooFarAheadError);
    });

    it('does not apply the window to staff creating on the customer’s behalf', async () => {
      const serviceId = await seedService();

      const result = await useCase.execute(
        input(serviceId, {
          tenantBookingWindow: STRICT_NOTICE,
          actorType: 'STAFF',
          actorId: STAFF_ID,
          bodyCustomerId: CUSTOMER_ID,
        }),
      );

      expect(result.status).toBe('ACTIVE');
    });

    it('still refuses staff a first occurrence in the past', async () => {
      const serviceId = await seedService();

      await expect(
        useCase.execute(
          input(serviceId, {
            recurrence: { ...TUESDAY_10_LOCAL, daysOfWeek: [...EVERY_DAY] },
            startsOn: pastDate(5),
            endsOn: futureDate(10),
            actorType: 'STAFF',
            actorId: STAFF_ID,
            bodyCustomerId: CUSTOMER_ID,
          }),
        ),
      ).rejects.toThrow(BookingScheduledInPastError);
    });

    describe('renewal', () => {
      it('skips the minimum notice and the maximum days ahead for the same routine', async () => {
        const serviceId = await seedService();
        const renewsScheduleId = seedPrevious(serviceId);

        const result = await useCase.execute(
          input(serviceId, {
            tenantBookingWindow: { minBookingAdvanceHours: 24 * 10, maxBookingAdvanceDays: 1 },
            renewsScheduleId,
          }),
        );

        expect(result.status).toBe('ACTIVE');
        expect(await bookingRepo.findAllByTenant(TENANT)).toHaveLength(5);
      });

      it('treats a changed duration as a new schedule and applies the window', async () => {
        const serviceId = await seedService();
        const renewsScheduleId = seedPrevious(serviceId, { durationMinutes: 60 });

        await expect(
          useCase.execute(
            input(serviceId, { tenantBookingWindow: STRICT_NOTICE, renewsScheduleId }),
          ),
        ).rejects.toThrow(BookingTooSoonError);
      });

      it('treats a changed weekday set as a new schedule', async () => {
        const serviceId = await seedService();
        const renewsScheduleId = seedPrevious(serviceId);

        await expect(
          useCase.execute(
            input(serviceId, {
              tenantBookingWindow: STRICT_NOTICE,
              renewsScheduleId,
              recurrence: { ...TUESDAY_10_LOCAL, daysOfWeek: ['tuesday', 'thursday'] },
            }),
          ),
        ).rejects.toThrow(BookingTooSoonError);
      });

      it('treats a changed start time as a new schedule', async () => {
        const serviceId = await seedService();
        const renewsScheduleId = seedPrevious(serviceId);

        await expect(
          useCase.execute(
            input(serviceId, {
              tenantBookingWindow: STRICT_NOTICE,
              renewsScheduleId,
              recurrence: { ...TUESDAY_10_LOCAL, startTime: '11:00' },
            }),
          ),
        ).rejects.toThrow(BookingTooSoonError);
      });

      it('treats a start more than a day after the old term ended as a new schedule', async () => {
        const serviceId = await seedService();
        const renewsScheduleId = seedPrevious(serviceId, { endsOn: addDaysUTC(STARTS_ON, -3) });

        await expect(
          useCase.execute(
            input(serviceId, { tenantBookingWindow: STRICT_NOTICE, renewsScheduleId }),
          ),
        ).rejects.toThrow(BookingTooSoonError);
      });

      it('accepts a start exactly one day after the old term ended', async () => {
        const serviceId = await seedService();
        const renewsScheduleId = seedPrevious(serviceId, { endsOn: addDaysUTC(STARTS_ON, -1) });

        const result = await useCase.execute(
          input(serviceId, { tenantBookingWindow: STRICT_NOTICE, renewsScheduleId }),
        );

        expect(result.status).toBe('ACTIVE');
      });

      it('books only the occurrences still ahead when the renewal is made late', async () => {
        const serviceId = await seedService();
        const renewsScheduleId = seedPrevious(serviceId);
        // Second Tuesday, one hour after it started: the first two have passed, three remain.
        const secondTuesday = new Date(`${addDaysUTC(STARTS_ON, 7)}T14:00:00.000Z`);
        jest.useFakeTimers({ now: secondTuesday, doNotFake: ['nextTick'] });

        await useCase.execute(input(serviceId, { renewsScheduleId }));

        const bookings = await bookingRepo.findAllByTenant(TENANT);
        expect(bookings).toHaveLength(3);
        expect(bookings.every((b) => b.scheduledAt > secondTuesday)).toBe(true);
      });

      it('refuses a renewal with nothing left ahead', async () => {
        const serviceId = await seedService();
        const renewsScheduleId = seedPrevious(serviceId);
        jest.useFakeTimers({
          now: new Date(`${addDaysUTC(ENDS_ON, 1)}T00:00:00.000Z`),
          doNotFake: ['nextTick'],
        });

        await expect(useCase.execute(input(serviceId, { renewsScheduleId }))).rejects.toThrow(
          BookingScheduledInPastError,
        );
        expect(await bookingRepo.findAllByTenant(TENANT)).toHaveLength(0);
      });

      it('reports a reference that does not exist as not found', async () => {
        const serviceId = await seedService();

        await expect(
          useCase.execute(
            input(serviceId, { renewsScheduleId: '00000000-0000-4000-8000-00000000dead' }),
          ),
        ).rejects.toThrow(RecurringBookingScheduleNotFoundError);
      });

      it('reports another customer’s schedule as not found, never as an exemption', async () => {
        const serviceId = await seedService();
        const renewsScheduleId = seedPrevious(serviceId, { customerId: OTHER_CUSTOMER_ID });

        await expect(
          useCase.execute(
            input(serviceId, { tenantBookingWindow: STRICT_NOTICE, renewsScheduleId }),
          ),
        ).rejects.toThrow(RecurringBookingScheduleNotFoundError);
      });

      it('checks the reference against the customer the staff member acts for', async () => {
        const serviceId = await seedService();
        const renewsScheduleId = seedPrevious(serviceId, { customerId: OTHER_CUSTOMER_ID });

        await expect(
          useCase.execute(
            input(serviceId, {
              renewsScheduleId,
              actorType: 'STAFF',
              actorId: STAFF_ID,
              bodyCustomerId: CUSTOMER_ID,
            }),
          ),
        ).rejects.toThrow(RecurringBookingScheduleNotFoundError);
      });
    });
  });
});
