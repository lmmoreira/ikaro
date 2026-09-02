import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import { FULL_WEEK_BUSINESS_HOURS } from '../../../../test/utils/business-hours-fixtures';
import { ResourceType } from '../../domain/resource.types';
import { CreateTenantLocationResourceUseCase } from './create-tenant-location-resource.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000010';
const CORRELATION_ID = 'corr-create-tenant-location';
const EVENT_ID = 'event-tenant-provisioned-location-1';

const baseDto = {
  tenantId: TENANT_ID,
  eventId: EVENT_ID,
  correlationId: CORRELATION_ID,
};

describe('CreateTenantLocationResourceUseCase', () => {
  let repo: InMemoryResourceRepository;
  let platform: InMemoryBookingPlatformPort;
  let inboxRepo: InMemoryInboxRepository;
  let useCase: CreateTenantLocationResourceUseCase;

  beforeEach(() => {
    repo = new InMemoryResourceRepository();
    platform = new InMemoryBookingPlatformPort();
    inboxRepo = new InMemoryInboxRepository();
    useCase = new CreateTenantLocationResourceUseCase(
      repo,
      platform,
      inboxRepo,
      new InMemoryTransactionManager(),
    );
  });

  it('creates an active LOCATION resource with the locale-aware pt-BR name and tenant business hours', async () => {
    platform.seedBusinessHoursAndLocale(TENANT_ID, {
      businessHours: FULL_WEEK_BUSINESS_HOURS,
      locale: 'pt-BR',
    });

    const result = await useCase.execute(baseDto);

    const saved = await repo.findById(result.resourceId, TENANT_ID);
    expect(saved).not.toBeNull();
    expect(saved!.type).toBe(ResourceType.LOCATION);
    expect(saved!.refId).toBeNull();
    expect(saved!.name).toBe('Localização Principal');
    expect(saved!.workingHours).toBeNull();
    expect(saved!.turnoverMinutes).toBe(0);
    expect(saved!.maxCapacity).toBeNull();
    expect(saved!.isActive).toBe(true);
    expect(saved!.tenantId).toBe(TENANT_ID);
  });

  it('creates an active LOCATION resource with the locale-aware English name for an en tenant', async () => {
    platform.seedBusinessHoursAndLocale(TENANT_ID, {
      businessHours: FULL_WEEK_BUSINESS_HOURS,
      locale: 'en',
    });

    const result = await useCase.execute(baseDto);

    const saved = await repo.findById(result.resourceId, TENANT_ID);
    expect(saved!.name).toBe('Main Location');
  });

  it('marks the TenantProvisioned event processed in the inbox', async () => {
    await useCase.execute(baseDto);

    expect(
      await inboxRepo.hasBeenProcessed(EVENT_ID, CreateTenantLocationResourceUseCase.CONSUMER_NAME),
    ).toBe(true);
  });

  it('no-ops (no save, no inbox write) when an active LOCATION resource already exists for the tenant', async () => {
    const existing = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.LOCATION)
      .withRefId(null)
      .build();
    await repo.save(existing);

    const result = await useCase.execute(baseDto);

    expect(result.resourceId).toBe(existing.id);
    const all = await repo.findByTenant(TENANT_ID, { type: ResourceType.LOCATION });
    expect(all).toHaveLength(1);
    expect(
      await inboxRepo.hasBeenProcessed(EVENT_ID, CreateTenantLocationResourceUseCase.CONSUMER_NAME),
    ).toBe(false);
  });

  it('redelivery: a second execute() with the same eventId creates exactly one LOCATION resource', async () => {
    const first = await useCase.execute(baseDto);
    const second = await useCase.execute(baseDto);

    expect(second.resourceId).toBe(first.resourceId);
    const all = await repo.findByTenant(TENANT_ID, { type: ResourceType.LOCATION });
    expect(all).toHaveLength(1);
  });

  it('throws a data-inconsistency error when the inbox says already-processed but no LOCATION resource exists', async () => {
    await inboxRepo.markProcessed(EVENT_ID, CreateTenantLocationResourceUseCase.CONSUMER_NAME);

    await expect(useCase.execute(baseDto)).rejects.toThrow(/data inconsistency/);
  });

  it('tenant isolation: creates the resource scoped to the correct tenantId', async () => {
    const result = await useCase.execute(baseDto);
    const saved = await repo.findById(result.resourceId, TENANT_ID);
    expect(saved!.tenantId).toBe(TENANT_ID);
  });
});
