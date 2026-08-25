import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryLeadFormConfigRepository } from '../../../../test/repositories/platform/in-memory-lead-form-config.repository';
import { HotsiteConfigBuilder } from '../../../../test/builders/platform/hotsite-config.builder';
import {
  LeadFormConfigBuilder,
  makeLeadFormQuestion,
} from '../../../../test/builders/platform/lead-form-config.builder';
import { LeadFormNotEnabledError } from '../../domain/errors/lead-form-domain.error';
import { HotsiteModule } from '../../domain/hotsite-config.aggregate';
import { GetLeadFormPublicConfigUseCase } from './get-lead-form-public-config.use-case';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '01234567-0000-7000-8000-000000000002';

function leadFormModule(overrides: Partial<HotsiteModule> = {}): HotsiteModule {
  return {
    type: 'LEAD_FORM',
    enabled: true,
    data: { title: 'Fale com a gente', ctaLabel: 'Preencher formulário' },
    ...overrides,
  };
}

describe('GetLeadFormPublicConfigUseCase', () => {
  let hotsiteConfigRepo: InMemoryHotsiteConfigRepository;
  let leadFormConfigRepo: InMemoryLeadFormConfigRepository;
  let useCase: GetLeadFormPublicConfigUseCase;

  beforeEach(() => {
    hotsiteConfigRepo = new InMemoryHotsiteConfigRepository();
    leadFormConfigRepo = new InMemoryLeadFormConfigRepository();
    useCase = new GetLeadFormPublicConfigUseCase(hotsiteConfigRepo, leadFormConfigRepo);
  });

  it('throws LeadFormNotEnabledError when the tenant has no HotsiteConfig row at all', async () => {
    await expect(useCase.execute({ tenantId: TENANT_ID })).rejects.toThrow(LeadFormNotEnabledError);
  });

  it('throws LeadFormNotEnabledError when the layout has no LEAD_FORM entry', async () => {
    await hotsiteConfigRepo.save(new HotsiteConfigBuilder().withTenantId(TENANT_ID).build());

    await expect(useCase.execute({ tenantId: TENANT_ID })).rejects.toThrow(LeadFormNotEnabledError);
  });

  it('throws LeadFormNotEnabledError when the LEAD_FORM entry exists but enabled: false', async () => {
    const hotsiteConfig = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [leadFormModule({ enabled: false })]);
    await hotsiteConfigRepo.save(hotsiteConfig);

    await expect(useCase.execute({ tenantId: TENANT_ID })).rejects.toThrow(LeadFormNotEnabledError);
  });

  it('returns { audienceMode, questions } only — never the teaser fields — when enabled', async () => {
    const hotsiteConfig = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [leadFormModule()]);
    await hotsiteConfigRepo.save(hotsiteConfig);
    const question = makeLeadFormQuestion();
    await leadFormConfigRepo.save(
      new LeadFormConfigBuilder().withTenantId(TENANT_ID).withQuestions([question]).build(),
    );

    const result = await useCase.execute({ tenantId: TENANT_ID });

    expect(result).toEqual({ audienceMode: 'GUEST_AND_CUSTOMER', questions: [question] });
    expect(result).not.toHaveProperty('title');
    expect(result).not.toHaveProperty('ctaLabel');
  });

  it('returns a default { audienceMode: GUEST_AND_CUSTOMER, questions: [] } when no LeadFormConfig row exists yet', async () => {
    const hotsiteConfig = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [leadFormModule()]);
    await hotsiteConfigRepo.save(hotsiteConfig);

    const result = await useCase.execute({ tenantId: TENANT_ID });

    expect(result).toEqual({ audienceMode: 'GUEST_AND_CUSTOMER', questions: [] });
  });

  it('tenant isolation — enabling the module for tenant A never enables it for tenant B', async () => {
    const hotsiteConfig = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [leadFormModule()]);
    await hotsiteConfigRepo.save(hotsiteConfig);

    await expect(useCase.execute({ tenantId: OTHER_TENANT_ID })).rejects.toThrow(
      LeadFormNotEnabledError,
    );
  });
});
