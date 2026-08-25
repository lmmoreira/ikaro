import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryLeadFormConfigRepository } from '../../../../test/repositories/platform/in-memory-lead-form-config.repository';
import { InMemoryLeadFormSubmissionRepository } from '../../../../test/repositories/platform/in-memory-lead-form-submission.repository';
import { HotsiteConfigBuilder } from '../../../../test/builders/platform/hotsite-config.builder';
import {
  LeadFormConfigBuilder,
  makeLeadFormQuestion,
} from '../../../../test/builders/platform/lead-form-config.builder';
import { RequestContext } from '../../../../shared/request/request-context';
import { TRANSACTION_MANAGER } from '../../../../shared/ports/transaction-manager.port';
import { TENANT_SETTINGS_PORT } from '../../../../shared/ports/tenant-settings.port';
import { HOTSITE_CONFIG_REPOSITORY } from '../../application/ports/hotsite-config-repository.port';
import { LEAD_FORM_CONFIG_REPOSITORY } from '../../application/ports/lead-form-config-repository.port';
import { LEAD_FORM_SUBMISSION_REPOSITORY } from '../../application/ports/lead-form-submission-repository.port';
import { CreateLeadFormSubmissionUseCase } from '../../application/use-cases/create-lead-form-submission.use-case';
import { GetLeadFormPublicConfigUseCase } from '../../application/use-cases/get-lead-form-public-config.use-case';
import { HotsiteModule } from '../../domain/hotsite-config.aggregate';
import { LeadFormPublicController } from './lead-form-public.controller';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '01234567-0000-7000-8000-000000000002';
const QUESTION_ID = '01234567-0000-7000-8000-000000000101';

function leadFormModule(overrides: Partial<HotsiteModule> = {}): HotsiteModule {
  return {
    type: 'LEAD_FORM',
    enabled: true,
    data: { title: 'Fale com a gente', ctaLabel: 'Preencher formulário' },
    ...overrides,
  };
}

describe('LeadFormPublicController', () => {
  let controller: LeadFormPublicController;
  let hotsiteConfigRepo: InMemoryHotsiteConfigRepository;
  let leadFormConfigRepo: InMemoryLeadFormConfigRepository;
  let requestContext: { tenantId: string; correlationId: string };

  beforeEach(async () => {
    hotsiteConfigRepo = new InMemoryHotsiteConfigRepository();
    leadFormConfigRepo = new InMemoryLeadFormConfigRepository();
    requestContext = { tenantId: '', correlationId: 'corr-1' };

    const moduleRef = await Test.createTestingModule({
      controllers: [LeadFormPublicController],
      providers: [
        GetLeadFormPublicConfigUseCase,
        CreateLeadFormSubmissionUseCase,
        { provide: HOTSITE_CONFIG_REPOSITORY, useValue: hotsiteConfigRepo },
        { provide: LEAD_FORM_CONFIG_REPOSITORY, useValue: leadFormConfigRepo },
        {
          provide: LEAD_FORM_SUBMISSION_REPOSITORY,
          useValue: new InMemoryLeadFormSubmissionRepository(),
        },
        { provide: TENANT_SETTINGS_PORT, useValue: new InMemoryTenantSettingsPort() },
        { provide: TRANSACTION_MANAGER, useValue: new InMemoryTransactionManager() },
        { provide: RequestContext, useValue: requestContext },
      ],
    }).compile();

    controller = moduleRef.get(LeadFormPublicController);
  });

  async function enableLeadForm(
    tenantId: string,
    questions: ReturnType<typeof makeLeadFormQuestion>[] = [
      makeLeadFormQuestion({ id: QUESTION_ID }),
    ],
    audienceMode: 'GUEST_AND_CUSTOMER' | 'CUSTOMER_ONLY' = 'GUEST_AND_CUSTOMER',
  ): Promise<void> {
    const hotsiteConfig = new HotsiteConfigBuilder()
      .withTenantId(tenantId)
      .buildWithContent(undefined, [leadFormModule()]);
    await hotsiteConfigRepo.save(hotsiteConfig);
    await leadFormConfigRepo.save(
      new LeadFormConfigBuilder()
        .withTenantId(tenantId)
        .withAudienceMode(audienceMode)
        .withQuestions(questions)
        .build(),
    );
  }

  describe('getConfig', () => {
    it('returns { audienceMode, questions } for an enabled module', async () => {
      requestContext.tenantId = TENANT_ID;
      await enableLeadForm(TENANT_ID);

      const result = await controller.getConfig();

      expect(result.audienceMode).toBe('GUEST_AND_CUSTOMER');
      expect(result.questions).toHaveLength(1);
    });

    it('maps LeadFormNotEnabledError to 404 HttpException', async () => {
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

  describe('submit', () => {
    it('creates a submission for a guest (customerId: null)', async () => {
      requestContext.tenantId = TENANT_ID;
      await enableLeadForm(TENANT_ID);

      const result = await controller.submit({
        name: 'Maria Silva',
        email: 'maria.silva@example.com',
        phone: '+5511987654321',
        answers: [{ questionId: QUESTION_ID, value: 'Lavagem completa' }],
        customerId: null,
        ipAddress: '203.0.113.10',
      });

      expect(result.submissionId).toBeDefined();
    });

    it('maps LeadFormNotEnabledError to 404 HttpException', async () => {
      requestContext.tenantId = 'non-existent-id';

      expect.assertions(2);
      try {
        await controller.submit({
          name: 'Maria Silva',
          email: 'maria.silva@example.com',
          phone: '+5511987654321',
          answers: [],
          customerId: null,
          ipAddress: '203.0.113.10',
        });
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('maps LeadFormCustomerOnlyError to 401 HttpException', async () => {
      requestContext.tenantId = TENANT_ID;
      await enableLeadForm(TENANT_ID, [], 'CUSTOMER_ONLY');

      expect.assertions(2);
      try {
        await controller.submit({
          name: 'Guest',
          email: 'guest@example.com',
          phone: '+5511900000000',
          answers: [],
          customerId: null,
          ipAddress: '203.0.113.10',
        });
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      }
    });

    it('maps LeadFormAnswerQuestionInvalidError to 400 HttpException', async () => {
      requestContext.tenantId = TENANT_ID;
      await enableLeadForm(TENANT_ID, [makeLeadFormQuestion({ id: QUESTION_ID, required: false })]);

      expect.assertions(2);
      try {
        await controller.submit({
          name: 'Maria Silva',
          email: 'maria.silva@example.com',
          phone: '+5511987654321',
          answers: [{ questionId: '01234567-0000-7000-8000-000000009999', value: 'x' }],
          customerId: null,
          ipAddress: '203.0.113.10',
        });
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    });

    it('maps LeadFormAnswerRequiredError to 400 HttpException', async () => {
      requestContext.tenantId = TENANT_ID;
      await enableLeadForm(TENANT_ID, [makeLeadFormQuestion({ id: QUESTION_ID, required: true })]);

      expect.assertions(2);
      try {
        await controller.submit({
          name: 'Maria Silva',
          email: 'maria.silva@example.com',
          phone: '+5511987654321',
          answers: [],
          customerId: null,
          ipAddress: '203.0.113.10',
        });
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    });

    it('tenant isolation — a submission for tenant A never resolves against tenant B config', async () => {
      requestContext.tenantId = OTHER_TENANT_ID;
      await enableLeadForm(TENANT_ID);

      expect.assertions(2);
      try {
        await controller.submit({
          name: 'Maria Silva',
          email: 'maria.silva@example.com',
          phone: '+5511987654321',
          answers: [{ questionId: QUESTION_ID, value: 'x' }],
          customerId: null,
          ipAddress: '203.0.113.10',
        });
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });
});
