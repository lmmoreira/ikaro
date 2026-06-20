import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantBuilder } from '../../../../test/builders/platform/index';
import { TenantQueryService } from '../../../platform/application/services/tenant-query.service';
import { BookingPlatformAdapter } from './booking-platform.adapter';

describe('BookingPlatformAdapter', () => {
  let repo: InMemoryTenantRepository;
  let adapter: BookingPlatformAdapter;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    adapter = new BookingPlatformAdapter(new TenantQueryService(repo));
  });

  it('returns all active tenants with their timezones', async () => {
    const active = new TenantBuilder().build();
    await repo.save(active);

    const result = await adapter.findAllActive();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(active.id);
    expect(result[0].timezone).toBe('America/Sao_Paulo');
  });

  it('returns an empty array when no tenants exist', async () => {
    const result = await adapter.findAllActive();
    expect(result).toEqual([]);
  });

  it('resolves independently for two different tenants', async () => {
    const tenantA = new TenantBuilder().withSlug('tenant-a').build();
    const tenantB = new TenantBuilder().withSlug('tenant-b').build();
    await repo.save(tenantA);
    await repo.save(tenantB);

    const result = await adapter.findAllActive();

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(expect.arrayContaining([tenantA.id, tenantB.id]));
  });
});
