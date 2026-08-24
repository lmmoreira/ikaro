import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryLeadFormConfigRepository } from '../../../../test/repositories/platform/in-memory-lead-form-config.repository';
import { HotsiteConfigBuilder } from '../../../../test/builders/platform/hotsite-config.builder';
import { LeadFormConfigBuilder } from '../../../../test/builders/platform/lead-form-config.builder';
import { HotsiteNotFoundError } from '../../domain/errors/platform-domain.error';
import { HotsiteModule } from '../../domain/hotsite-config.aggregate';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { HotsiteContentReader } from '../services/hotsite-content-reader.service';
import { GetLeadFormConfigUseCase } from './get-lead-form-config.use-case';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '01234567-0000-7000-8000-000000000002';

describe('GetLeadFormConfigUseCase', () => {
  let hotsiteConfigRepo: InMemoryHotsiteConfigRepository;
  let leadFormConfigRepo: InMemoryLeadFormConfigRepository;
  let useCase: GetLeadFormConfigUseCase;

  beforeEach(() => {
    hotsiteConfigRepo = new InMemoryHotsiteConfigRepository();
    leadFormConfigRepo = new InMemoryLeadFormConfigRepository();
    const hotsiteContentReader = new HotsiteContentReader(
      hotsiteConfigRepo,
      new InMemoryStorageService(),
      new HotsiteImageUrlResolver(),
    );
    useCase = new GetLeadFormConfigUseCase(hotsiteContentReader, leadFormConfigRepo);
  });

  it('throws HotsiteNotFoundError when the tenant has no HotsiteConfig row', async () => {
    await expect(useCase.execute({ tenantId: TENANT_ID })).rejects.toThrow(HotsiteNotFoundError);
  });

  it('returns the { title: "", ctaLabel: "" } default when no LEAD_FORM layout entry exists yet', async () => {
    await hotsiteConfigRepo.save(new HotsiteConfigBuilder().withTenantId(TENANT_ID).build());

    const result = await useCase.execute({ tenantId: TENANT_ID });

    expect(result.title).toBe('');
    expect(result.ctaLabel).toBe('');
    expect(result.subtitle).toBeUndefined();
  });

  it('returns a default { audienceMode, questions: [] } shape when no LeadFormConfig row exists yet', async () => {
    await hotsiteConfigRepo.save(new HotsiteConfigBuilder().withTenantId(TENANT_ID).build());

    const result = await useCase.execute({ tenantId: TENANT_ID });

    expect(result.audienceMode).toBe('GUEST_AND_CUSTOMER');
    expect(result.questions).toEqual([]);
  });

  it('merges the teaser fields from HotsiteConfig with audienceMode/questions from LeadFormConfig', async () => {
    const leadFormModule: HotsiteModule = {
      type: 'LEAD_FORM',
      enabled: true,
      data: { title: 'Fale com a gente', ctaLabel: 'Preencher formulário' },
    };
    const hotsiteConfig = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [leadFormModule]);
    await hotsiteConfigRepo.save(hotsiteConfig);

    const leadFormConfig = new LeadFormConfigBuilder()
      .withTenantId(TENANT_ID)
      .withAudienceMode('CUSTOMER_ONLY')
      .build();
    await leadFormConfigRepo.save(leadFormConfig);

    const result = await useCase.execute({ tenantId: TENANT_ID });

    expect(result.title).toBe('Fale com a gente');
    expect(result.ctaLabel).toBe('Preencher formulário');
    expect(result.audienceMode).toBe('CUSTOMER_ONLY');
  });

  it('tenant isolation — does not leak tenant A data when read as tenant B', async () => {
    const leadFormModule: HotsiteModule = {
      type: 'LEAD_FORM',
      enabled: true,
      data: { title: 'Tenant A only', ctaLabel: 'Preencher formulário' },
    };
    const hotsiteConfig = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [leadFormModule]);
    await hotsiteConfigRepo.save(hotsiteConfig);
    await leadFormConfigRepo.save(
      new LeadFormConfigBuilder().withTenantId(TENANT_ID).withAudienceMode('CUSTOMER_ONLY').build(),
    );

    await expect(useCase.execute({ tenantId: OTHER_TENANT_ID })).rejects.toThrow(
      HotsiteNotFoundError,
    );
  });
});
