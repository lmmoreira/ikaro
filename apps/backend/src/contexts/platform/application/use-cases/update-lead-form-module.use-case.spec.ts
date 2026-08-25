import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryLeadFormConfigRepository } from '../../../../test/repositories/platform/in-memory-lead-form-config.repository';
import { InMemoryLeadFormSubmissionRepository } from '../../../../test/repositories/platform/in-memory-lead-form-submission.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { HotsiteConfigBuilder } from '../../../../test/builders/platform/hotsite-config.builder';
import { makeLeadFormQuestions as makeQuestions } from '../../../../test/builders/platform/lead-form-config.builder';
import { TenantBuilder } from '../../../../test/builders/platform/tenant.builder';
import {
  HotsiteNotFoundError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';
import { HotsiteModule } from '../../domain/hotsite-config.aggregate';
import { LeadFormQuestionLimitReachedError } from '../../domain/errors/lead-form-domain.error';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { HotsiteImagePromotionService } from '../services/hotsite-image-promotion.service';
import { UpdateLeadFormModuleUseCase } from './update-lead-form-module.use-case';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';

describe('UpdateLeadFormModuleUseCase', () => {
  let hotsiteConfigRepo: InMemoryHotsiteConfigRepository;
  let leadFormConfigRepo: InMemoryLeadFormConfigRepository;
  let leadFormSubmissionRepo: InMemoryLeadFormSubmissionRepository;
  let tenantRepo: InMemoryTenantRepository;
  let txManager: InMemoryTransactionManager;
  let useCase: UpdateLeadFormModuleUseCase;

  beforeEach(async () => {
    hotsiteConfigRepo = new InMemoryHotsiteConfigRepository();
    leadFormConfigRepo = new InMemoryLeadFormConfigRepository();
    leadFormSubmissionRepo = new InMemoryLeadFormSubmissionRepository();
    tenantRepo = new InMemoryTenantRepository();
    txManager = new InMemoryTransactionManager();
    const imagePathsService = new HotsiteImagePathsService();
    useCase = new UpdateLeadFormModuleUseCase(
      hotsiteConfigRepo,
      leadFormConfigRepo,
      leadFormSubmissionRepo,
      tenantRepo,
      txManager,
      imagePathsService,
      new HotsiteImagePromotionService(new InMemoryStorageService(), imagePathsService),
      new HotsiteImageUrlResolver(),
      new InMemoryStorageService(),
    );
    await tenantRepo.save(new TenantBuilder().withId(TENANT_ID).build());
  });

  it('throws HotsiteNotFoundError when the tenant has no HotsiteConfig row', async () => {
    await expect(
      useCase.execute({ tenantId: TENANT_ID, title: 'Fale com a gente' }),
    ).rejects.toThrow(HotsiteNotFoundError);
  });

  it('throws TenantNotFoundError when the tenant row is missing', async () => {
    await hotsiteConfigRepo.save(new HotsiteConfigBuilder().withTenantId('other-tenant').build());

    await expect(
      useCase.execute({ tenantId: 'other-tenant', title: 'Fale com a gente' }),
    ).rejects.toThrow(TenantNotFoundError);
  });

  it('creates a new LEAD_FORM layout entry (enabled: false) on the first save', async () => {
    await hotsiteConfigRepo.save(new HotsiteConfigBuilder().withTenantId(TENANT_ID).build());

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      title: 'Fale com a gente',
      ctaLabel: 'Preencher formulário',
    });

    expect(result.title).toBe('Fale com a gente');
    expect(result.ctaLabel).toBe('Preencher formulário');

    const saved = await hotsiteConfigRepo.findByTenantId(TENANT_ID);
    const leadFormModule = saved!.layout.find((m) => m.type === 'LEAD_FORM');
    expect(leadFormModule?.enabled).toBe(false);
  });

  it('preserves the existing enabled value when updating an already-existing entry', async () => {
    const existingModule: HotsiteModule = {
      type: 'LEAD_FORM',
      enabled: true,
      data: { title: 'Old title', ctaLabel: 'Old CTA' },
    };
    await hotsiteConfigRepo.save(
      new HotsiteConfigBuilder()
        .withTenantId(TENANT_ID)
        .buildWithContent(undefined, [existingModule]),
    );

    await useCase.execute({ tenantId: TENANT_ID, title: 'New title' });

    const saved = await hotsiteConfigRepo.findByTenantId(TENANT_ID);
    const leadFormModule = saved!.layout.find((m) => m.type === 'LEAD_FORM');
    expect(leadFormModule?.enabled).toBe(true);
    expect((leadFormModule?.data as { title: string }).title).toBe('New title');
    expect((leadFormModule?.data as { ctaLabel: string }).ctaLabel).toBe('Old CTA');
  });

  it('writes both HotsiteConfig and LeadFormConfig in the same transaction', async () => {
    await hotsiteConfigRepo.save(new HotsiteConfigBuilder().withTenantId(TENANT_ID).build());

    await useCase.execute({
      tenantId: TENANT_ID,
      title: 'Fale com a gente',
      ctaLabel: 'Preencher formulário',
      audienceMode: 'CUSTOMER_ONLY',
      questions: makeQuestions(1),
    });

    expect(txManager.runCallCount).toBe(1);
    const leadFormConfig = await leadFormConfigRepo.findByTenantId(TENANT_ID);
    expect(leadFormConfig!.audienceMode).toBe('CUSTOMER_ONLY');
    expect(leadFormConfig!.questions).toHaveLength(1);
  });

  it('never opens a transaction when question validation fails before any save', async () => {
    await hotsiteConfigRepo.save(new HotsiteConfigBuilder().withTenantId(TENANT_ID).build());

    await expect(
      useCase.execute({ tenantId: TENANT_ID, questions: makeQuestions(21) }),
    ).rejects.toThrow(LeadFormQuestionLimitReachedError);

    expect(txManager.runCallCount).toBe(0);
    const leadFormConfig = await leadFormConfigRepo.findByTenantId(TENANT_ID);
    expect(leadFormConfig).toBeNull();
  });
});
