import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantBuilder } from '../../../../test/builders/platform/index';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import { ScheduleTenantSettingsAdapter } from './schedule-tenant-settings.adapter';

describe('ScheduleTenantSettingsAdapter', () => {
  let repo: InMemoryTenantRepository;
  let adapter: ScheduleTenantSettingsAdapter;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    adapter = new ScheduleTenantSettingsAdapter(new GetTenantByIdUseCase(repo));
  });

  it('returns business_hours for a known tenant', async () => {
    const tenant = new TenantBuilder().build();
    await repo.save(tenant);

    const hours = await adapter.getBusinessHours(tenant.id);

    expect(hours.monday).toBeDefined();
    expect(hours.sunday).toBeNull();
  });

  it('propagates TenantNotFoundError when tenant does not exist', async () => {
    await expect(adapter.getBusinessHours('unknown-id')).rejects.toThrow();
  });

  it('resolves independently for two different tenants', async () => {
    const tenantA = new TenantBuilder().withSlug('tenant-a').build();
    const tenantB = new TenantBuilder().withSlug('tenant-b').build();
    await repo.save(tenantA);
    await repo.save(tenantB);

    const [hoursA, hoursB] = await Promise.all([
      adapter.getBusinessHours(tenantA.id),
      adapter.getBusinessHours(tenantB.id),
    ]);

    expect(hoursA.monday).toEqual(hoursB.monday);
  });
});
