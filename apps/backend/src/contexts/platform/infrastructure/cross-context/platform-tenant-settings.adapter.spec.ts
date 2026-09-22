import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantBuilder } from '../../../../test/builders/platform/index';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import { PlatformTenantSettingsAdapter } from './platform-tenant-settings.adapter';

describe('PlatformTenantSettingsAdapter', () => {
  let repo: InMemoryTenantRepository;
  let adapter: PlatformTenantSettingsAdapter;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    adapter = new PlatformTenantSettingsAdapter(repo);
  });

  it('returns the full settings for a known tenant', async () => {
    const tenant = new TenantBuilder().build();
    await repo.save(tenant);

    const settings = await adapter.getSettings(tenant.id);

    expect(settings.localization.currency).toBe('BRL');
    expect(settings.localization.countryCode).toBe('BR');
    expect(settings.businessHours.timezone).toBe('America/Sao_Paulo');
    expect(settings.booking.cancellationWindowHours).toBe(48);
  });

  it('propagates TenantNotFoundError when tenant does not exist', async () => {
    await expect(adapter.getSettings('unknown-id')).rejects.toThrow();
  });

  // Regression test — GetTenantByIdUseCase's admin-response projection deliberately strips every
  // Ikaro-only chatbot override down to `{ knowledgeText }`. This port must NOT reuse that
  // projection: RequestContext.settings.chatbot (populated from this port on every request) is
  // what SendChatMessageUseCase/GetChatbotStatusUseCase/GetChatbotCapStatusUseCase resolve tenant
  // overrides from. Previously silently discarded every override in production (M19-S10).
  it('preserves Ikaro-only chatbot overrides (never leaked to the admin HTTP response, but required here)', async () => {
    const tenantSettings = TenantSettings.create({
      ...TenantSettings.default().toJSON(),
      chatbot: { knowledgeText: 'texto', maxConversationsPerDay: 5, llmProvider: 'anthropic' },
    });
    const tenant = new TenantBuilder().withSettings(tenantSettings).build();
    await repo.save(tenant);

    const settings = await adapter.getSettings(tenant.id);

    expect(settings.chatbot).toEqual({
      knowledgeText: 'texto',
      maxConversationsPerDay: 5,
      llmProvider: 'anthropic',
    });
  });
});
