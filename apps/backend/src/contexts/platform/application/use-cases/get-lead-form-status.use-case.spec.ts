import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { HotsiteConfigBuilder } from '../../../../test/builders/platform/hotsite-config.builder';
import { HotsiteNotFoundError } from '../../domain/errors/platform-domain.error';
import { HotsiteModule } from '../../domain/hotsite-config.aggregate';
import { GetLeadFormStatusUseCase } from './get-lead-form-status.use-case';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';

describe('GetLeadFormStatusUseCase', () => {
  let hotsiteConfigRepo: InMemoryHotsiteConfigRepository;
  let useCase: GetLeadFormStatusUseCase;

  beforeEach(() => {
    hotsiteConfigRepo = new InMemoryHotsiteConfigRepository();
    useCase = new GetLeadFormStatusUseCase(hotsiteConfigRepo);
  });

  it('throws HotsiteNotFoundError when the tenant has no HotsiteConfig row', async () => {
    await expect(useCase.execute({ tenantId: TENANT_ID })).rejects.toThrow(HotsiteNotFoundError);
  });

  it('returns { enabled: false } when the tenant has never enabled the module', async () => {
    await hotsiteConfigRepo.save(new HotsiteConfigBuilder().withTenantId(TENANT_ID).build());

    const result = await useCase.execute({ tenantId: TENANT_ID });

    expect(result).toEqual({ enabled: false });
  });

  it('returns { enabled: false } when the LEAD_FORM layout entry exists but is disabled', async () => {
    const leadFormModule: HotsiteModule = {
      type: 'LEAD_FORM',
      enabled: false,
      data: { title: 'Fale com a gente', ctaLabel: 'Preencher formulário' },
    };
    const hotsiteConfig = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [leadFormModule]);
    await hotsiteConfigRepo.save(hotsiteConfig);

    const result = await useCase.execute({ tenantId: TENANT_ID });

    expect(result).toEqual({ enabled: false });
  });

  it('returns { enabled: true } once the flag is set via the layout entry', async () => {
    const leadFormModule: HotsiteModule = {
      type: 'LEAD_FORM',
      enabled: true,
      data: { title: 'Fale com a gente', ctaLabel: 'Preencher formulário' },
    };
    const hotsiteConfig = new HotsiteConfigBuilder()
      .withTenantId(TENANT_ID)
      .buildWithContent(undefined, [leadFormModule]);
    await hotsiteConfigRepo.save(hotsiteConfig);

    const result = await useCase.execute({ tenantId: TENANT_ID });

    expect(result).toEqual({ enabled: true });
  });
});
