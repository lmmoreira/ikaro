import { TenantBuilder, TenantSettingsPropsBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { TenantSettings, TenantSettingsProps } from '../../domain/value-objects/tenant-settings.vo';
import { GetTenantByIdUseCase } from './get-tenant-by-id.use-case';

describe('GetTenantByIdUseCase', () => {
  let repo: InMemoryTenantRepository;
  let useCase: GetTenantByIdUseCase;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    useCase = new GetTenantByIdUseCase(repo);
  });

  it('throws TenantNotFoundError when the tenant does not exist', async () => {
    await expect(useCase.execute({ tenantId: 'unknown-id' })).rejects.toBeInstanceOf(
      TenantNotFoundError,
    );
  });

  it('returns id, slug, name, and settings for a known tenant', async () => {
    const tenant = new TenantBuilder().withSlug('lavacar-bh').withName('Lavacar BH').build();
    await repo.save(tenant);

    const result = await useCase.execute({ tenantId: tenant.id });

    expect(result.id).toBe(tenant.id);
    expect(result.slug).toBe('lavacar-bh');
    expect(result.name).toBe('Lavacar BH');
    expect(result.settings.businessHours.sunday).toBeNull();
    expect(result.settings.businessHours.monday).toBeDefined();
  });

  it('returns chatbot: { knowledgeText: "" } for a legacy tenant whose stored settings predate the chatbot category', async () => {
    const legacyProps: TenantSettingsProps = new TenantSettingsPropsBuilder().build();
    delete legacyProps.chatbot;
    const tenant = new TenantBuilder()
      .withSettings(TenantSettings.reconstitute(legacyProps))
      .build();
    await repo.save(tenant);

    const result = await useCase.execute({ tenantId: tenant.id });

    expect(result.settings.chatbot).toEqual({ knowledgeText: '' });
  });

  it('never leaks an Ikaro-only chatbot override (llmProvider, caps) into the response', async () => {
    const props = new TenantSettingsPropsBuilder()
      .withChatbot({
        knowledgeText: 'texto',
        llmProvider: 'anthropic',
        maxConversationsPerDay: 100,
      })
      .build();
    const tenant = new TenantBuilder().withSettings(TenantSettings.create(props)).build();
    await repo.save(tenant);

    const result = await useCase.execute({ tenantId: tenant.id });

    expect(result.settings.chatbot).toEqual({ knowledgeText: 'texto' });
  });
});
