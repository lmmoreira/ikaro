import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { GetTenantBillingInfoUseCase } from '../../../platform/application/use-cases/get-tenant-billing-info.use-case';
import { BillingTenantNotFoundError } from '../../domain/errors/billing-domain.error';
import { BillingPlatformAdapter } from './billing-platform.adapter';

describe('BillingPlatformAdapter', () => {
  let tenants: InMemoryTenantRepository;
  let adapter: BillingPlatformAdapter;

  beforeEach(() => {
    tenants = new InMemoryTenantRepository();
    adapter = new BillingPlatformAdapter(new GetTenantBillingInfoUseCase(tenants));
  });

  it("returns the tenant's createdAt, countryCode, timezone and slug", async () => {
    const tenant = new TenantBuilder().withSlug('lavacar-bh').build();
    await tenants.save(tenant);

    await expect(adapter.getTenantInfo(tenant.id)).resolves.toEqual({
      tenantId: tenant.id,
      slug: 'lavacar-bh',
      countryCode: tenant.settings.localization.countryCode,
      timezone: tenant.settings.businessHours.timezone,
      createdAt: tenant.createdAt,
    });
  });

  it("translates Platform's not-found into Billing's typed one (never a transient error)", async () => {
    await expect(adapter.getTenantInfo('missing')).rejects.toBeInstanceOf(
      BillingTenantNotFoundError,
    );
  });

  it('lets any other failure through unchanged, so the resolver can fail open', async () => {
    const boom = new Error('db down');
    class FailingTenantRepository extends InMemoryTenantRepository {
      override findById(): Promise<never> {
        return Promise.reject(boom);
      }
    }
    const failing = new BillingPlatformAdapter(
      new GetTenantBillingInfoUseCase(new FailingTenantRepository()),
    );

    await expect(failing.getTenantInfo('t-1')).rejects.toBe(boom);
  });
});
