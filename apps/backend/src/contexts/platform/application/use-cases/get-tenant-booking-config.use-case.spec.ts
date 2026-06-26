import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { GetTenantBookingConfigUseCase } from './get-tenant-booking-config.use-case';

describe('GetTenantBookingConfigUseCase', () => {
  let repo: InMemoryTenantRepository;
  let useCase: GetTenantBookingConfigUseCase;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    useCase = new GetTenantBookingConfigUseCase(repo);
  });

  it('throws TenantNotFoundError when the tenant does not exist', async () => {
    await expect(useCase.execute('unknown-id')).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('returns welcomeStaffScreenDays for a known tenant', async () => {
    const tenant = new TenantBuilder().withSlug('lavacar-bh').build();
    await repo.save(tenant);

    const result = await useCase.execute(tenant.id);

    expect(result.welcomeStaffScreenDays).toBe(14);
  });
});
