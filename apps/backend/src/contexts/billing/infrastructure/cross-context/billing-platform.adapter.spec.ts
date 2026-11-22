import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { GetTenantBillingInfoUseCase } from '../../../platform/application/use-cases/get-tenant-billing-info.use-case';
import { ListTenantsCreatedBeforeUseCase } from '../../../platform/application/use-cases/list-tenants-created-before.use-case';
import { BillingTenantNotFoundError } from '../../domain/errors/billing-domain.error';
import { BillingPlatformAdapter } from './billing-platform.adapter';

describe('BillingPlatformAdapter', () => {
  let tenants: InMemoryTenantRepository;
  let adapter: BillingPlatformAdapter;

  beforeEach(() => {
    tenants = new InMemoryTenantRepository();
    adapter = new BillingPlatformAdapter(
      new GetTenantBillingInfoUseCase(tenants),
      new ListTenantsCreatedBeforeUseCase(tenants),
    );
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
      isActive: true,
    });
  });

  it('lists tenants created before the cutoff as exactly the six documented fields, oldest first', async () => {
    const old = new TenantBuilder()
      .withSlug('old-one')
      .withCreatedAt(new Date(Date.now() - 3_600_000))
      .build();
    const young = new TenantBuilder().withSlug('young-one').build();
    await tenants.save(young);
    await tenants.save(old);

    const page = await adapter.listTenantsCreatedBefore(new Date(Date.now() - 60_000), 10);

    expect(page).toEqual([
      {
        tenantId: old.id,
        slug: 'old-one',
        countryCode: old.settings.localization.countryCode,
        timezone: old.settings.businessHours.timezone,
        createdAt: old.createdAt,
        isActive: true,
      },
    ]);
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
    const failingTenants = new FailingTenantRepository();
    const failing = new BillingPlatformAdapter(
      new GetTenantBillingInfoUseCase(failingTenants),
      new ListTenantsCreatedBeforeUseCase(failingTenants),
    );

    await expect(failing.getTenantInfo('t-1')).rejects.toBe(boom);
  });
});
