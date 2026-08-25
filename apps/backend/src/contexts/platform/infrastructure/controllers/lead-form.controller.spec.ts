import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryLeadFormConfigRepository } from '../../../../test/repositories/platform/in-memory-lead-form-config.repository';
import { InMemoryLeadFormSubmissionRepository } from '../../../../test/repositories/platform/in-memory-lead-form-submission.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { HotsiteConfigBuilder } from '../../../../test/builders/platform/hotsite-config.builder';
import { makeLeadFormQuestions } from '../../../../test/builders/platform/lead-form-config.builder';
import { LeadFormSubmissionBuilder } from '../../../../test/builders/platform/lead-form-submission.builder';
import { TenantBuilder } from '../../../../test/builders/platform/tenant.builder';
import { RequestContext } from '../../../../shared/request/request-context';
import { TRANSACTION_MANAGER } from '../../../../shared/ports/transaction-manager.port';
import { STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { HOTSITE_CONFIG_REPOSITORY } from '../../application/ports/hotsite-config-repository.port';
import { LEAD_FORM_CONFIG_REPOSITORY } from '../../application/ports/lead-form-config-repository.port';
import { LEAD_FORM_SUBMISSION_REPOSITORY } from '../../application/ports/lead-form-submission-repository.port';
import { TENANT_REPOSITORY } from '../../application/ports/tenant-repository.port';
import { HotsiteContentReader } from '../../application/services/hotsite-content-reader.service';
import { HotsiteImagePromotionService } from '../../application/services/hotsite-image-promotion.service';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { GetLeadFormConfigUseCase } from '../../application/use-cases/get-lead-form-config.use-case';
import { GetLeadFormStatusUseCase } from '../../application/use-cases/get-lead-form-status.use-case';
import { GetLeadFormSubmissionUseCase } from '../../application/use-cases/get-lead-form-submission.use-case';
import { ListLeadFormSubmissionsUseCase } from '../../application/use-cases/list-lead-form-submissions.use-case';
import { UpdateLeadFormModuleUseCase } from '../../application/use-cases/update-lead-form-module.use-case';
import { LeadFormController } from './lead-form.controller';

describe('LeadFormController', () => {
  let controller: LeadFormController;
  let hotsiteConfigRepo: InMemoryHotsiteConfigRepository;
  let tenantRepo: InMemoryTenantRepository;
  let submissionRepo: InMemoryLeadFormSubmissionRepository;
  let requestContext: { tenantId: string };

  beforeEach(async () => {
    hotsiteConfigRepo = new InMemoryHotsiteConfigRepository();
    tenantRepo = new InMemoryTenantRepository();
    submissionRepo = new InMemoryLeadFormSubmissionRepository();
    requestContext = { tenantId: '' };

    const moduleRef = await Test.createTestingModule({
      controllers: [LeadFormController],
      providers: [
        GetLeadFormConfigUseCase,
        UpdateLeadFormModuleUseCase,
        GetLeadFormStatusUseCase,
        ListLeadFormSubmissionsUseCase,
        GetLeadFormSubmissionUseCase,
        { provide: HOTSITE_CONFIG_REPOSITORY, useValue: hotsiteConfigRepo },
        { provide: LEAD_FORM_CONFIG_REPOSITORY, useValue: new InMemoryLeadFormConfigRepository() },
        { provide: LEAD_FORM_SUBMISSION_REPOSITORY, useValue: submissionRepo },
        { provide: TENANT_REPOSITORY, useValue: tenantRepo },
        { provide: TRANSACTION_MANAGER, useValue: new InMemoryTransactionManager() },
        { provide: STORAGE_SERVICE, useValue: new InMemoryStorageService() },
        HotsiteContentReader,
        HotsiteImagePathsService,
        HotsiteImagePromotionService,
        HotsiteImageUrlResolver,
        { provide: RequestContext, useValue: requestContext },
      ],
    }).compile();

    controller = moduleRef.get(LeadFormController);
  });

  describe('getConfig', () => {
    it('returns the default shape for a tenant with no LeadFormConfig row yet', async () => {
      const tenant = new TenantBuilder().withSlug('ctrl-lead-form-get-01').build();
      await tenantRepo.save(tenant);
      await hotsiteConfigRepo.save(new HotsiteConfigBuilder().withTenantId(tenant.id).build());
      requestContext.tenantId = tenant.id;

      const result = await controller.getConfig();

      expect(result.title).toBe('');
      expect(result.audienceMode).toBe('GUEST_AND_CUSTOMER');
      expect(result.questions).toEqual([]);
    });

    it('maps HotsiteNotFoundError to 404 HttpException', async () => {
      requestContext.tenantId = 'non-existent-id';

      expect.assertions(2);
      try {
        await controller.getConfig();
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });

  describe('updateConfig', () => {
    it('saves teaser fields and questions atomically, returning the merged shape', async () => {
      const tenant = new TenantBuilder().withSlug('ctrl-lead-form-patch-01').build();
      await tenantRepo.save(tenant);
      await hotsiteConfigRepo.save(new HotsiteConfigBuilder().withTenantId(tenant.id).build());
      requestContext.tenantId = tenant.id;

      const result = await controller.updateConfig({
        title: 'Fale com a gente',
        ctaLabel: 'Preencher formulário',
        audienceMode: 'CUSTOMER_ONLY',
      });

      expect(result.title).toBe('Fale com a gente');
      expect(result.audienceMode).toBe('CUSTOMER_ONLY');
    });

    it('maps LeadFormQuestionLimitReachedError to 400 HttpException', async () => {
      const tenant = new TenantBuilder().withSlug('ctrl-lead-form-patch-02').build();
      await tenantRepo.save(tenant);
      await hotsiteConfigRepo.save(new HotsiteConfigBuilder().withTenantId(tenant.id).build());
      requestContext.tenantId = tenant.id;

      const tooMany = makeLeadFormQuestions(21);

      expect.assertions(2);
      try {
        await controller.updateConfig({ questions: tooMany });
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    });
  });

  describe('getStatus', () => {
    it('returns { enabled: false } for a tenant that has never enabled the module', async () => {
      const tenant = new TenantBuilder().withSlug('ctrl-lead-form-status-01').build();
      await tenantRepo.save(tenant);
      await hotsiteConfigRepo.save(new HotsiteConfigBuilder().withTenantId(tenant.id).build());
      requestContext.tenantId = tenant.id;

      const result = await controller.getStatus();

      expect(result).toEqual({ enabled: false });
    });
  });

  describe('listSubmissions', () => {
    it('delegates to the use case with the resolved tenantId and query params', async () => {
      const tenant = new TenantBuilder().withSlug('ctrl-lead-form-list-01').build();
      await tenantRepo.save(tenant);
      requestContext.tenantId = tenant.id;
      await submissionRepo.save(
        new LeadFormSubmissionBuilder().withTenantId(tenant.id).withName('Maria Silva').build(),
      );

      const result = await controller.listSubmissions({ page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Maria Silva');
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(1);
    });
  });

  describe('getSubmission', () => {
    it('delegates to the use case with the resolved tenantId and id param', async () => {
      const tenant = new TenantBuilder().withSlug('ctrl-lead-form-detail-01').build();
      await tenantRepo.save(tenant);
      requestContext.tenantId = tenant.id;
      const submission = new LeadFormSubmissionBuilder()
        .withTenantId(tenant.id)
        .withName('Maria Silva')
        .build();
      await submissionRepo.save(submission);

      const result = await controller.getSubmission(submission.id);

      expect(result.id).toBe(submission.id);
      expect(result.name).toBe('Maria Silva');
    });

    it('maps LeadFormSubmissionNotFoundError to 404 HttpException', async () => {
      const tenant = new TenantBuilder().withSlug('ctrl-lead-form-detail-02').build();
      await tenantRepo.save(tenant);
      requestContext.tenantId = tenant.id;

      expect.assertions(2);
      try {
        await controller.getSubmission('01234567-0000-7000-8000-000000000099');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });
});
