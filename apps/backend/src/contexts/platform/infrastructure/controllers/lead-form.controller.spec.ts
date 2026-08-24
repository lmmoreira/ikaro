import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryLeadFormConfigRepository } from '../../../../test/repositories/platform/in-memory-lead-form-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { HotsiteConfigBuilder } from '../../../../test/builders/platform/hotsite-config.builder';
import { TenantBuilder } from '../../../../test/builders/platform/tenant.builder';
import { RequestContext } from '../../../../shared/request/request-context';
import { TRANSACTION_MANAGER } from '../../../../shared/ports/transaction-manager.port';
import { HOTSITE_CONFIG_REPOSITORY } from '../../application/ports/hotsite-config-repository.port';
import { LEAD_FORM_CONFIG_REPOSITORY } from '../../application/ports/lead-form-config-repository.port';
import { TENANT_REPOSITORY } from '../../application/ports/tenant-repository.port';
import { GetLeadFormConfigUseCase } from '../../application/use-cases/get-lead-form-config.use-case';
import { GetLeadFormStatusUseCase } from '../../application/use-cases/get-lead-form-status.use-case';
import { UpdateLeadFormModuleUseCase } from '../../application/use-cases/update-lead-form-module.use-case';
import { LeadFormController } from './lead-form.controller';

describe('LeadFormController', () => {
  let controller: LeadFormController;
  let hotsiteConfigRepo: InMemoryHotsiteConfigRepository;
  let tenantRepo: InMemoryTenantRepository;
  let requestContext: { tenantId: string };

  beforeEach(async () => {
    hotsiteConfigRepo = new InMemoryHotsiteConfigRepository();
    tenantRepo = new InMemoryTenantRepository();
    requestContext = { tenantId: '' };

    const moduleRef = await Test.createTestingModule({
      controllers: [LeadFormController],
      providers: [
        GetLeadFormConfigUseCase,
        UpdateLeadFormModuleUseCase,
        GetLeadFormStatusUseCase,
        { provide: HOTSITE_CONFIG_REPOSITORY, useValue: hotsiteConfigRepo },
        { provide: LEAD_FORM_CONFIG_REPOSITORY, useValue: new InMemoryLeadFormConfigRepository() },
        { provide: TENANT_REPOSITORY, useValue: tenantRepo },
        { provide: TRANSACTION_MANAGER, useValue: new InMemoryTransactionManager() },
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

      const tooMany = Array.from({ length: 21 }, (_, i) => ({
        id: `01234567-0000-7000-8000-0000000001${String(i).padStart(2, '0')}`,
        label: `Q${i}`,
        type: 'TEXT' as const,
        required: false,
        order: i,
      }));

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
});
