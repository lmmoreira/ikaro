import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantBuilder } from '../../../../test/builders/platform/index';
import { GetTenantByIdUseCase } from '../../application/use-cases/get-tenant-by-id.use-case';
import { PlatformTenantSettingsAdapter } from './platform-tenant-settings.adapter';

describe('PlatformTenantSettingsAdapter', () => {
  let repo: InMemoryTenantRepository;
  let adapter: PlatformTenantSettingsAdapter;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    adapter = new PlatformTenantSettingsAdapter(new GetTenantByIdUseCase(repo));
  });

  it('returns the full settings for a known tenant', async () => {
    const tenant = new TenantBuilder().build();
    await repo.save(tenant);

    const settings = await adapter.getSettings(tenant.id);

    expect(settings.localization.currency).toBe('BRL');
    expect(settings.localization.country_code).toBe('BR');
    expect(settings.business_hours.timezone).toBe('America/Sao_Paulo');
    expect(settings.booking.cancellation_window_hours).toBe(48);
  });

  it('propagates TenantNotFoundError when tenant does not exist', async () => {
    await expect(adapter.getSettings('unknown-id')).rejects.toThrow();
  });
});
