import { addDaysUTC, utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { createTestBookableUntilGuard } from '../../../../test/infrastructure/test-bookable-until-guard';
import {
  AvailabilityAlertBuilder,
  ResourceBuilder,
  ServiceBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryAvailabilityAlertRepository } from '../../../../test/repositories/booking/in-memory-availability-alert.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { AvailabilityAlert } from '../../domain/availability-alert.aggregate';
import { Service } from '../../domain/service.aggregate';
import {
  AvailabilityAlertCriteriaInvalidError,
  AvailabilityAlertNotEditableError,
  AvailabilityAlertNotFoundError,
} from '../../domain/errors/availability-alert.error';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import {
  BookingDurationOutOfRangeError,
  BookingServiceNotInTenantError,
  BookingTooFarAheadError,
} from '../../domain/errors/booking-domain.error';
import { AvailabilityAlertResultAssembler } from '../services/availability-alert-result.assembler';
import { BookingQuoteService } from '../services/booking-quote.service';
import { UpdateAvailabilityAlertUseCase } from './update-availability-alert.use-case';

const TENANT = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT = '00000000-0000-7000-8000-000000000002';
const CUSTOMER = '00000000-0000-7000-8000-0000000000c1';
const OTHER_CUSTOMER = '00000000-0000-7000-8000-0000000000c2';
const DAY_MS = 86_400_000;
const OTHER_TENANT_SERVICE = '00000000-0000-7000-8000-0000000000f2';

describe('UpdateAvailabilityAlertUseCase', () => {
  let alertRepo: InMemoryAvailabilityAlertRepository;
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let eventBus: InMemoryEventBus;
  let useCase: UpdateAvailabilityAlertUseCase;
  let guardParts: ReturnType<typeof createTestBookableUntilGuard>;

  // Every alert is bound to a seeded FIXED-duration service by default, because an update that
  // sends a duration reads its service.
  let defaultService: Service;

  const seedAlert = (
    build: (b: AvailabilityAlertBuilder) => AvailabilityAlertBuilder = (b) => b,
  ) => {
    const alert = build(
      new AvailabilityAlertBuilder().withCustomerId(CUSTOMER).withServiceId(defaultService.id),
    ).build();
    alertRepo.seed(alert);
    return alert;
  };

  const seedVariableDurationAlert = async (status: AvailabilityAlert['status'] = 'ACTIVE') => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT)
      .withBookingPolicy({
        availabilityAlertEligible: true,
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 60,
        durationMaxMinutes: 240,
        durationIncrementMinutes: 30,
      })
      .build();
    await serviceRepo.save(service);
    return seedAlert((b) => b.withServiceId(service.id).withDurationMinutes(90).withStatus(status));
  };

  const run = (
    alert: AvailabilityAlert,
    changes: Partial<Parameters<UpdateAvailabilityAlertUseCase['execute']>[0]>,
    overrides: { customerId?: string; tenantId?: string } = {},
  ) =>
    useCase.execute({
      alertId: alert.id,
      tenantId: overrides.tenantId ?? TENANT,
      customerId: overrides.customerId ?? CUSTOMER,
      correlationId: 'corr-1',
      ...changes,
    });

  beforeEach(async () => {
    eventBus = new InMemoryEventBus();
    alertRepo = new InMemoryAvailabilityAlertRepository(eventBus);
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    guardParts = createTestBookableUntilGuard();
    useCase = new UpdateAvailabilityAlertUseCase(
      alertRepo,
      serviceRepo,
      resourceRepo,
      new InMemoryTransactionManager(),
      new BookingQuoteService(),
      new AvailabilityAlertResultAssembler(serviceRepo, resourceRepo, alertRepo),
      guardParts.guard,
    );
    defaultService = new ServiceBuilder().withTenantId(TENANT).build();
    await serviceRepo.save(defaultService);
  });

  it('updates the numeric criteria, saves and publishes AvailabilityAlertUpdated', async () => {
    const alert = seedAlert();

    const result = await run(alert, { durationMinutes: 90, participantCount: 3 });

    expect(result).toMatchObject({ id: alert.id, durationMinutes: 90, participantCount: 3 });
    expect((await alertRepo.findById(alert.id, TENANT))?.durationMinutes).toBe(90);
    expect(eventBus.published.map((e) => e.eventName)).toEqual(['AvailabilityAlertUpdated']);
  });

  it('overlays the patched criteria fields on the current ones', async () => {
    const alert = seedAlert((b) => b.withWeeklyPreference(['tuesday'], '18:00', '20:00'));

    const result = await run(alert, { weekdays: ['friday'] });

    expect(result).toMatchObject({ weekdays: ['friday'], localStartTime: '18:00' });
  });

  it('switches the criteria type when the full new set is sent', async () => {
    const alert = seedAlert();

    const result = await run(alert, {
      criteriaType: 'WEEKLY_PREFERENCE',
      weekdays: ['monday'],
      localStartTime: '09:00',
      localEndTime: '10:00',
    });

    expect(result).toMatchObject({
      criteriaType: 'WEEKLY_PREFERENCE',
      acceptableStartAt: null,
      acceptableEndAt: null,
    });
  });

  it('refuses a mix of both criteria representations', async () => {
    const alert = seedAlert();

    await expect(run(alert, { weekdays: ['monday'] })).rejects.toThrow(
      AvailabilityAlertCriteriaInvalidError,
    );
    expect(eventBus.published).toHaveLength(0);
  });

  it('keeps the current expiry unless a new one is sent, and takes a new one', async () => {
    const alert = seedAlert((b) => b.withWeeklyPreference(['monday'], '09:00', '10:00'));
    const before = alert.expiresAt.toISOString();

    expect((await run(alert, { durationMinutes: 30 })).expiresAt).toBe(before);

    const newExpiry = new Date(Date.now() + 20 * DAY_MS).toISOString();
    expect((await run(alert, { expiresAt: newExpiry })).expiresAt).toBe(newExpiry);
  });

  it.each(['NOTIFIED', 'EXPIRED', 'CANCELLED'] as const)(
    'refuses to edit a %s alert',
    async (status) => {
      const alert = seedAlert((b) => b.withStatus(status));

      await expect(run(alert, { durationMinutes: 30 })).rejects.toThrow(
        AvailabilityAlertNotEditableError,
      );
    },
  );

  it("reads another customer's alert in the same tenant as not found", async () => {
    const alert = seedAlert();

    await expect(
      run(alert, { durationMinutes: 30 }, { customerId: OTHER_CUSTOMER }),
    ).rejects.toThrow(AvailabilityAlertNotFoundError);
  });

  it("reads another tenant's alert as not found", async () => {
    const alert = seedAlert();

    await expect(run(alert, { durationMinutes: 30 }, { tenantId: OTHER_TENANT })).rejects.toThrow(
      AvailabilityAlertNotFoundError,
    );
  });

  describe('the billing bookable-until cap (M26-S18b)', () => {
    const seedCap = (bookableUntil: string | null) =>
      guardParts.access.seed(TENANT, {
        status: 'ACTIVE',
        suspensionReason: null,
        operational: true,
        features: [{ key: 'BOOKING', tier: 'STANDARD' }],
        bookableUntil,
      });
    // The tenant-local date of an instant, never the UTC day.
    const localDateOf = (instant: Date) => utcDateToLocalDate(instant, 'America/Sao_Paulo');
    const inDays = (days: number) => new Date(Date.now() + days * DAY_MS);
    const weeklyAlert = (expiresAt: Date) =>
      seedAlert((b) =>
        b.withWeeklyPreference(['monday'], '09:00', '10:00').withExpiresAt(expiresAt),
      );

    it('refuses an edit to a weekly alert whose expiry reaches the cap and publishes nothing', async () => {
      const expiresAt = inDays(7);
      const alert = weeklyAlert(expiresAt);
      seedCap(localDateOf(expiresAt));

      await expect(run(alert, { durationMinutes: 30 })).rejects.toBeInstanceOf(
        BookingTooFarAheadError,
      );

      expect(eventBus.published).toHaveLength(0);
    });

    it('updates a weekly alert whose expiry ends before the cap day', async () => {
      const expiresAt = inDays(7);
      const alert = weeklyAlert(expiresAt);
      seedCap(addDaysUTC(localDateOf(expiresAt), 1));

      const result = await run(alert, { durationMinutes: 30 });

      expect(result.durationMinutes).toBe(30);
      expect(eventBus.published.map((e) => e.eventName)).toEqual(['AvailabilityAlertUpdated']);
    });

    it('refuses an edit that moves the expiry out to the cap, though the saved alert was before it', async () => {
      const alert = weeklyAlert(inDays(7));
      seedCap(localDateOf(inDays(10)));

      await expect(run(alert, { expiresAt: inDays(20).toISOString() })).rejects.toBeInstanceOf(
        BookingTooFarAheadError,
      );

      expect(eventBus.published).toHaveLength(0);
    });

    it('lets an edit pull the expiry in below the cap', async () => {
      const alert = weeklyAlert(inDays(20));
      const newExpiry = inDays(5);
      seedCap(addDaysUTC(localDateOf(newExpiry), 1));

      const result = await run(alert, { expiresAt: newExpiry.toISOString() });

      expect(result.expiresAt).toBe(newExpiry.toISOString());
    });

    it('refuses an edit to a one-time range that ends on the cap day', async () => {
      const end = inDays(4);
      const alert = seedAlert((b) => b.withOneTimeRange(inDays(3), end));
      seedCap(localDateOf(end));

      await expect(run(alert, { durationMinutes: 30 })).rejects.toBeInstanceOf(
        BookingTooFarAheadError,
      );

      expect(eventBus.published).toHaveLength(0);
    });

    it('updates a one-time range that ends before the cap day', async () => {
      const end = inDays(4);
      const alert = seedAlert((b) => b.withOneTimeRange(inDays(3), end));
      seedCap(addDaysUTC(localDateOf(end), 1));

      const result = await run(alert, { durationMinutes: 30 });

      expect(result.durationMinutes).toBe(30);
    });

    it('ends a one-time range at the earlier of its range end and its expiry', async () => {
      const expiresAt = inDays(3);
      const alert = seedAlert((b) =>
        b.withOneTimeRange(inDays(2), inDays(10)).withExpiresAt(expiresAt),
      );
      seedCap(localDateOf(inDays(6)));

      await expect(run(alert, { durationMinutes: 30 })).resolves.toMatchObject({
        durationMinutes: 30,
      });
    });

    it('is unchanged without a cap', async () => {
      const alert = weeklyAlert(inDays(7));
      seedCap(null);

      await expect(run(alert, { durationMinutes: 30 })).resolves.toMatchObject({
        durationMinutes: 30,
      });
    });

    it('takes the shared lock for the tenant and reads the cap uncached', async () => {
      const alert = weeklyAlert(inDays(7));

      await run(alert, { durationMinutes: 30 });

      expect(guardParts.lock.calls).toEqual([{ mode: 'shared', tenantId: TENANT }]);
      expect(guardParts.access.getBookableUntilCalls).toEqual([TENANT]);
    });
  });

  describe('duration on a customer-selected-duration service', () => {
    it('accepts a valid duration', async () => {
      const alert = await seedVariableDurationAlert();

      const result = await run(alert, { durationMinutes: 120 });

      expect(result.durationMinutes).toBe(120);
    });

    it.each([
      ['below the minimum', 30],
      ['above the maximum', 300],
      ['off the increment', 75],
      ['cleared with null', null],
    ])('refuses a duration %s and publishes nothing', async (_label, durationMinutes) => {
      const alert = await seedVariableDurationAlert();

      await expect(run(alert, { durationMinutes })).rejects.toThrow(BookingDurationOutOfRangeError);
      expect(eventBus.published).toHaveLength(0);
    });

    it('does not re-validate an update that leaves the duration alone', async () => {
      const alert = await seedVariableDurationAlert();

      const result = await run(alert, { participantCount: 2 });

      expect(result).toMatchObject({ durationMinutes: 90, participantCount: 2 });
    });

    it.each(['NOTIFIED', 'EXPIRED', 'CANCELLED'] as const)(
      'answers not-editable, not the duration error, for a %s alert with an invalid duration',
      async (status) => {
        const alert = await seedVariableDurationAlert(status);

        await expect(run(alert, { durationMinutes: 45 })).rejects.toThrow(
          AvailabilityAlertNotEditableError,
        );
        await expect(run(alert, { durationMinutes: null })).rejects.toThrow(
          AvailabilityAlertNotEditableError,
        );
      },
    );

    it('still accepts any duration, or none, on a FIXED-duration service', async () => {
      const alert = seedAlert();

      expect((await run(alert, { durationMinutes: 45 })).durationMinutes).toBe(45);
      expect((await run(alert, { durationMinutes: null })).durationMinutes).toBeNull();
    });

    it("reads another tenant's service as not found before any duration check", async () => {
      const alert = seedAlert((b) => b.withServiceId(OTHER_TENANT_SERVICE));

      await expect(run(alert, { durationMinutes: 45 })).rejects.toThrow(
        BookingServiceNotInTenantError,
      );
    });
  });

  describe('preferred resource', () => {
    it('accepts an eligible resource, and clears the preference with null', async () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withBookingPolicy({ availabilityAlertEligible: true })
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.ROOM,
            selectionMode: 'CUSTOMER_CHOICE',
          }),
        ])
        .build();
      await serviceRepo.save(service);
      const room = new ResourceBuilder().withTenantId(TENANT).build();
      await resourceRepo.save(room);
      const alert = seedAlert((b) => b.withServiceId(service.id));

      expect((await run(alert, { preferredResourceId: room.id })).preferredResourceId).toBe(
        room.id,
      );
      expect((await run(alert, { preferredResourceId: null })).preferredResourceId).toBeNull();
    });

    it('rejects a resource that cannot serve the alert service', async () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.ROOM,
            selectionMode: 'CUSTOMER_CHOICE',
          }),
        ])
        .build();
      await serviceRepo.save(service);
      const equipment = new ResourceBuilder()
        .withTenantId(TENANT)
        .withType(ResourceType.EQUIPMENT)
        .build();
      await resourceRepo.save(equipment);
      const alert = seedAlert((b) => b.withServiceId(service.id));

      await expect(run(alert, { preferredResourceId: equipment.id })).rejects.toThrow(
        AvailabilityAlertCriteriaInvalidError,
      );
    });
  });
});
