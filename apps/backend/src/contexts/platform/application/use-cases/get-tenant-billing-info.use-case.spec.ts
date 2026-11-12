import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { GetTenantBillingInfoUseCase } from './get-tenant-billing-info.use-case';

describe('GetTenantBillingInfoUseCase', () => {
  let repo: InMemoryTenantRepository;
  let useCase: GetTenantBillingInfoUseCase;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    useCase = new GetTenantBillingInfoUseCase(repo);
  });

  it('throws TenantNotFoundError when the tenant does not exist', async () => {
    await expect(useCase.execute({ tenantId: 'unknown-id' })).rejects.toBeInstanceOf(
      TenantNotFoundError,
    );
  });

  it('returns exactly tenantId, slug, countryCode, timezone and createdAt', async () => {
    const tenant = new TenantBuilder().withSlug('lavacar-bh').build();
    await repo.save(tenant);

    const result = await useCase.execute({ tenantId: tenant.id });

    expect(result).toEqual({
      tenantId: tenant.id,
      slug: 'lavacar-bh',
      countryCode: tenant.settings.localization.countryCode,
      timezone: tenant.settings.businessHours.timezone,
      createdAt: tenant.createdAt,
    });
  });
});
