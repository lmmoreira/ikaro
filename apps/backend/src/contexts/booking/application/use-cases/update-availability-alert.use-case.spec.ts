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
} from '../../domain/errors/booking-domain.error';
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

  const seedVariableDurationAlert = async () => {
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
    return seedAlert((b) => b.withServiceId(service.id).withDurationMinutes(90));
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
    useCase = new UpdateAvailabilityAlertUseCase(
      alertRepo,
      serviceRepo,
      resourceRepo,
      new InMemoryTransactionManager(),
      new BookingQuoteService(),
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
    ])('refuses a duration %s and leaves the alert untouched', async (_label, durationMinutes) => {
      const alert = await seedVariableDurationAlert();

      await expect(run(alert, { durationMinutes })).rejects.toThrow(BookingDurationOutOfRangeError);
      expect((await alertRepo.findById(alert.id, TENANT))?.durationMinutes).toBe(90);
      expect(eventBus.published).toHaveLength(0);
    });

    it('does not re-validate an update that leaves the duration alone', async () => {
      const alert = await seedVariableDurationAlert();

      const result = await run(alert, { participantCount: 2 });

      expect(result).toMatchObject({ durationMinutes: 90, participantCount: 2 });
    });

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
