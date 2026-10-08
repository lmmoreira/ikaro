import {
  AvailabilityAlertBuilder,
  ResourceBuilder,
  ServiceBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryAvailabilityAlertRepository } from '../../../../test/repositories/booking/in-memory-availability-alert.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ALERT_ACTIVE_CAP_PER_CUSTOMER } from '../../domain/availability-alert.aggregate';
import {
  AvailabilityAlertCapReachedError,
  AvailabilityAlertCriteriaInvalidError,
  AvailabilityAlertIneligibleServiceError,
} from '../../domain/errors/availability-alert.error';
import { BookingQuoteService } from '../services/booking-quote.service';
import {
  BookingDurationOutOfRangeError,
  BookingServiceNotActiveError,
  BookingServiceNotInTenantError,
} from '../../domain/errors/booking-domain.error';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceLeg } from '../../domain/service-leg';
import { Service } from '../../domain/service.aggregate';
import {
  CreateAvailabilityAlertUseCase,
  CreateAvailabilityAlertUseCaseInput,
} from './create-availability-alert.use-case';

const TENANT = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT = '00000000-0000-7000-8000-000000000002';
const CUSTOMER = '00000000-0000-7000-8000-0000000000c1';
const HOUR_MS = 3_600_000;

describe('CreateAvailabilityAlertUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let alertRepo: InMemoryAvailabilityAlertRepository;
  let eventBus: InMemoryEventBus;
  let useCase: CreateAvailabilityAlertUseCase;

  const roomRequirement = (resourcePoolIds?: string[]): ResourceRequirement =>
    ResourceRequirement.create({
      type: ResourceType.ROOM,
      selectionMode: 'CUSTOMER_CHOICE',
      resourcePoolIds,
    });

  async function seedService(
    overrides: { eligible?: boolean; active?: boolean } = {},
  ): Promise<Service> {
    const service = new ServiceBuilder()
      .withTenantId(TENANT)
      .withIsActive(overrides.active ?? true)
      .withBookingPolicy({ availabilityAlertEligible: overrides.eligible ?? true })
      .withResourceRequirements([roomRequirement()])
      .build();
    await serviceRepo.save(service);
    return service;
  }

  async function seedResource(
    build: (b: ResourceBuilder) => ResourceBuilder = (b) => b,
  ): Promise<Resource> {
    const resource = build(new ResourceBuilder().withTenantId(TENANT)).build();
    await resourceRepo.save(resource);
    return resource;
  }

  const input = (
    serviceId: string,
    overrides: Partial<CreateAvailabilityAlertUseCaseInput> = {},
  ): CreateAvailabilityAlertUseCaseInput => ({
    tenantId: TENANT,
    correlationId: 'corr-1',
    customerId: CUSTOMER,
    timezone: 'America/Sao_Paulo',
    serviceId,
    criteriaType: 'WEEKLY_PREFERENCE',
    weekdays: ['tuesday', 'thursday'],
    localStartTime: '18:00',
    localEndTime: '20:00',
    ...overrides,
  });

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    alertRepo = new InMemoryAvailabilityAlertRepository(eventBus);
    useCase = new CreateAvailabilityAlertUseCase(
      serviceRepo,
      resourceRepo,
      alertRepo,
      new InMemoryTenantLock(),
      new InMemoryTransactionManager(),
      new BookingQuoteService(),
    );
  });

  it('creates an ACTIVE alert for the customer, stores the tenant timezone and publishes AvailabilityAlertCreated', async () => {
    const service = await seedService();

    const result = await useCase.execute(input(service.id));

    expect(result).toMatchObject({
      serviceId: service.id,
      preferredResourceId: null,
      criteriaType: 'WEEKLY_PREFERENCE',
      timezone: 'America/Sao_Paulo',
      weekdays: ['tuesday', 'thursday'],
      localStartTime: '18:00',
      localEndTime: '20:00',
      acceptableStartAt: null,
      acceptableEndAt: null,
      status: 'ACTIVE',
    });
    const stored = await alertRepo.findById(result.id, TENANT);
    expect(stored?.customerId).toBe(CUSTOMER);
    expect(eventBus.published.map((e) => e.eventName)).toEqual(['AvailabilityAlertCreated']);
  });

  it('creates a one-time-range alert from ISO instants and keeps a requested expiry', async () => {
    const service = await seedService();
    const start = new Date(Date.now() + 48 * HOUR_MS);
    const end = new Date(Date.now() + 52 * HOUR_MS);
    const expiresAt = new Date(Date.now() + 50 * HOUR_MS);

    const result = await useCase.execute(
      input(service.id, {
        criteriaType: 'ONE_TIME_RANGE',
        weekdays: undefined,
        localStartTime: undefined,
        localEndTime: undefined,
        acceptableStartAt: start.toISOString(),
        acceptableEndAt: end.toISOString(),
        expiresAt: expiresAt.toISOString(),
        durationMinutes: 120,
        participantCount: 4,
      }),
    );

    expect(result).toMatchObject({
      criteriaType: 'ONE_TIME_RANGE',
      acceptableStartAt: start.toISOString(),
      acceptableEndAt: end.toISOString(),
      weekdays: null,
      expiresAt: expiresAt.toISOString(),
      durationMinutes: 120,
      participantCount: 4,
    });
  });

  describe('duration on a customer-selected-duration service', () => {
    const seedVariableDurationService = async (): Promise<Service> => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withBookingPolicy({
          availabilityAlertEligible: true,
          durationPolicy: 'CUSTOMER_SELECTED',
          durationMinMinutes: 60,
          durationMaxMinutes: 240,
          durationIncrementMinutes: 30,
        })
        .withResourceRequirements([roomRequirement()])
        .build();
      await serviceRepo.save(service);
      return service;
    };

    it('creates the alert with a valid duration', async () => {
      const service = await seedVariableDurationService();

      const result = await useCase.execute(input(service.id, { durationMinutes: 90 }));

      expect(result.durationMinutes).toBe(90);
    });

    it.each([
      ['missing', undefined],
      ['null', null],
      ['below the minimum', 30],
      ['above the maximum', 300],
      ['off the increment', 75],
    ])('refuses a duration that is %s and writes no alert', async (_label, durationMinutes) => {
      const service = await seedVariableDurationService();

      await expect(useCase.execute(input(service.id, { durationMinutes }))).rejects.toThrow(
        BookingDurationOutOfRangeError,
      );
      expect(await alertRepo.countActiveByCustomer(TENANT, CUSTOMER)).toBe(0);
      expect(eventBus.published).toHaveLength(0);
    });

    it('creates an alert on a FIXED-duration service with or without a duration', async () => {
      const service = await seedService();

      await expect(useCase.execute(input(service.id))).resolves.toBeDefined();
      await expect(
        useCase.execute(input(service.id, { durationMinutes: 45 })),
      ).resolves.toBeDefined();
    });

    it("reads another tenant's service as not found before any duration check", async () => {
      const service = await seedVariableDurationService();

      await expect(useCase.execute(input(service.id, { tenantId: OTHER_TENANT }))).rejects.toThrow(
        BookingServiceNotInTenantError,
      );
    });
  });

  it('rejects a service that does not permit alerts', async () => {
    const service = await seedService({ eligible: false });

    await expect(useCase.execute(input(service.id))).rejects.toThrow(
      AvailabilityAlertIneligibleServiceError,
    );
  });

  it('rejects an unknown service and a service of another tenant', async () => {
    const foreign = new ServiceBuilder()
      .withTenantId(OTHER_TENANT)
      .withBookingPolicy({ availabilityAlertEligible: true })
      .build();
    await serviceRepo.save(foreign);

    await expect(useCase.execute(input(foreign.id))).rejects.toThrow(
      BookingServiceNotInTenantError,
    );
    await expect(useCase.execute(input('00000000-0000-7000-8000-0000000000ff'))).rejects.toThrow(
      BookingServiceNotInTenantError,
    );
  });

  it('rejects a deactivated service', async () => {
    const service = await seedService({ active: false });

    await expect(useCase.execute(input(service.id))).rejects.toThrow(BookingServiceNotActiveError);
  });

  describe('preferred resource', () => {
    it('accepts an active resource of a type the service requires', async () => {
      const service = await seedService();
      const room = await seedResource();

      const result = await useCase.execute(input(service.id, { preferredResourceId: room.id }));

      expect(result.preferredResourceId).toBe(room.id);
    });

    it('accepts a resource required only by one of the service legs', async () => {
      const room = await seedResource();
      const journey = new ServiceBuilder()
        .withTenantId(TENANT)
        .withBookingPolicy({ availabilityAlertEligible: true })
        .withLegs([
          ServiceLeg.create({
            legIndex: 0,
            name: 'Etapa',
            durationMinutes: 30,
            transitionGapAfterMinutes: 0,
            resourceRequirements: [roomRequirement()],
          }),
        ])
        .build();
      await serviceRepo.save(journey);

      const result = await useCase.execute(input(journey.id, { preferredResourceId: room.id }));

      expect(result.preferredResourceId).toBe(room.id);
    });

    it('rejects an unknown resource', async () => {
      const service = await seedService();

      await expect(
        useCase.execute(
          input(service.id, { preferredResourceId: '00000000-0000-7000-8000-0000000000fe' }),
        ),
      ).rejects.toThrow(AvailabilityAlertCriteriaInvalidError);
    });

    it('rejects a resource of another tenant', async () => {
      const service = await seedService();
      const foreign = new ResourceBuilder().withTenantId(OTHER_TENANT).build();
      await resourceRepo.save(foreign);

      await expect(
        useCase.execute(input(service.id, { preferredResourceId: foreign.id })),
      ).rejects.toThrow(AvailabilityAlertCriteriaInvalidError);
    });

    it('rejects a deactivated resource', async () => {
      const service = await seedService();
      const room = await seedResource();
      room.deactivate();

      await expect(
        useCase.execute(input(service.id, { preferredResourceId: room.id })),
      ).rejects.toThrow(AvailabilityAlertCriteriaInvalidError);
    });

    it('rejects a resource of a type the service does not require', async () => {
      const service = await seedService();
      const equipment = await seedResource((b) => b.withType(ResourceType.EQUIPMENT));

      await expect(
        useCase.execute(input(service.id, { preferredResourceId: equipment.id })),
      ).rejects.toThrow(AvailabilityAlertCriteriaInvalidError);
    });

    it('rejects a resource outside the requirement pool restriction', async () => {
      const allowed = await seedResource();
      const outside = await seedResource();
      const restricted = new ServiceBuilder()
        .withTenantId(TENANT)
        .withBookingPolicy({ availabilityAlertEligible: true })
        .withResourceRequirements([roomRequirement([allowed.id])])
        .build();
      await serviceRepo.save(restricted);

      await expect(
        useCase.execute(input(restricted.id, { preferredResourceId: outside.id })),
      ).rejects.toThrow(AvailabilityAlertCriteriaInvalidError);
      await expect(
        useCase.execute(input(restricted.id, { preferredResourceId: allowed.id })),
      ).resolves.toMatchObject({ preferredResourceId: allowed.id });
    });
  });

  describe('per-customer cap', () => {
    const seedActive = (count: number, customerId = CUSTOMER, tenantId = TENANT): void => {
      for (let i = 0; i < count; i++) {
        alertRepo.seed(
          new AvailabilityAlertBuilder().withCustomerId(customerId).withTenantId(tenantId).build(),
        );
      }
    };

    it('rejects the 11th active alert', async () => {
      const service = await seedService();
      seedActive(ALERT_ACTIVE_CAP_PER_CUSTOMER);

      await expect(useCase.execute(input(service.id))).rejects.toThrow(
        AvailabilityAlertCapReachedError,
      );
    });

    it('allows the 10th active alert', async () => {
      const service = await seedService();
      seedActive(ALERT_ACTIVE_CAP_PER_CUSTOMER - 1);

      await expect(useCase.execute(input(service.id))).resolves.toMatchObject({ status: 'ACTIVE' });
    });

    it('counts only ACTIVE alerts — history does not use up the cap', async () => {
      const service = await seedService();
      seedActive(ALERT_ACTIVE_CAP_PER_CUSTOMER - 1);
      for (const status of ['NOTIFIED', 'CANCELLED', 'EXPIRED'] as const) {
        alertRepo.seed(
          new AvailabilityAlertBuilder().withCustomerId(CUSTOMER).withStatus(status).build(),
        );
      }

      await expect(useCase.execute(input(service.id))).resolves.toMatchObject({ status: 'ACTIVE' });
    });

    it("counts only the caller's own alerts, within the caller's tenant", async () => {
      const service = await seedService();
      seedActive(ALERT_ACTIVE_CAP_PER_CUSTOMER, '00000000-0000-7000-8000-0000000000c2');
      seedActive(ALERT_ACTIVE_CAP_PER_CUSTOMER, CUSTOMER, OTHER_TENANT);

      await expect(useCase.execute(input(service.id))).resolves.toMatchObject({ status: 'ACTIVE' });
    });
  });

  it('propagates the aggregate criteria validation (a range that already ended)', async () => {
    const service = await seedService();

    await expect(
      useCase.execute(
        input(service.id, {
          criteriaType: 'ONE_TIME_RANGE',
          weekdays: undefined,
          localStartTime: undefined,
          localEndTime: undefined,
          acceptableStartAt: new Date(Date.now() - 3 * HOUR_MS).toISOString(),
          acceptableEndAt: new Date(Date.now() - HOUR_MS).toISOString(),
        }),
      ),
    ).rejects.toThrow(AvailabilityAlertCriteriaInvalidError);
    expect(eventBus.published).toHaveLength(0);
  });
});
