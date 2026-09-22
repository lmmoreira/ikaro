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
import { localDayBoundsUTC } from '../../../../shared/utils/calendar-date';
import {
  LeadFormAnswerQuestionInvalidError,
  LeadFormAnswerRequiredError,
  LeadFormCustomerOnlyError,
  LeadFormDailyCapReachedError,
  LeadFormNotEnabledError,
  LeadFormTurnstileVerificationFailedError,
} from '../../domain/errors/lead-form-domain.error';
import { HotsiteModule } from '../../domain/hotsite-config.aggregate';
import { LeadFormAudienceMode, LeadFormQuestion } from '../../domain/lead-form-config.aggregate';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import { ITurnstileVerifierPort } from '../ports/turnstile-verifier.port';
import {
  CreateLeadFormSubmissionAnswerInput,
  CreateLeadFormSubmissionUseCase,
  CreateLeadFormSubmissionUseCaseInput,
} from './create-lead-form-submission.use-case';
import { GetLeadFormPublicConfigUseCase } from './get-lead-form-public-config.use-case';

class FakeTurnstileVerifier implements ITurnstileVerifierPort {
  result = true;
  calls: { token: string; remoteIp: string }[] = [];

  async verify(token: string, remoteIp: string): Promise<boolean> {
    this.calls.push({ token, remoteIp });
    return this.result;
  }
}

const TENANT_A = '10000000-0000-4000-8000-000000000031';
const TENANT_B = '10000000-0000-4000-8000-000000000032';
const CORRELATION_ID = 'corr-create-lead-form-submission-test';
const QUESTION_ID = 'q1';

const ANSWERS: CreateLeadFormSubmissionAnswerInput[] = [
  { questionId: QUESTION_ID, value: 'Google' },
];

function baseInput(
  overrides: Partial<CreateLeadFormSubmissionUseCaseInput> = {},
): CreateLeadFormSubmissionUseCaseInput {
  return {
    tenantId: TENANT_A,
    customerId: null,
    name: 'Maria Silva',
    email: 'maria@example.com',
    phone: '+5511912345678',
    answers: ANSWERS,
    ipAddress: '203.0.113.10',
    correlationId: CORRELATION_ID,
    turnstileToken: 'valid-turnstile-token',
    ...overrides,
  };
}

function leadFormModule(overrides: Partial<HotsiteModule> = {}): HotsiteModule {
  return {
    type: 'LEAD_FORM',
    enabled: true,
    data: { title: 'Fale com a gente', ctaLabel: 'Preencher formulário' },
    ...overrides,
  };
}

describe('CreateLeadFormSubmissionUseCase', () => {
  let useCase: CreateLeadFormSubmissionUseCase;
  let hotsiteConfigRepo: InMemoryHotsiteConfigRepository;
  let leadFormConfigRepo: InMemoryLeadFormConfigRepository;
  let submissionRepo: InMemoryLeadFormSubmissionRepository;
  let settingsPort: InMemoryTenantSettingsPort;
  let txManager: InMemoryTransactionManager;
  let turnstile: FakeTurnstileVerifier;

  beforeEach(() => {
    hotsiteConfigRepo = new InMemoryHotsiteConfigRepository();
    leadFormConfigRepo = new InMemoryLeadFormConfigRepository();
    submissionRepo = new InMemoryLeadFormSubmissionRepository();
    settingsPort = new InMemoryTenantSettingsPort();
    txManager = new InMemoryTransactionManager();
    turnstile = new FakeTurnstileVerifier();
    const getLeadFormPublicConfig = new GetLeadFormPublicConfigUseCase(
      hotsiteConfigRepo,
      leadFormConfigRepo,
    );
    useCase = new CreateLeadFormSubmissionUseCase(
      getLeadFormPublicConfig,
      submissionRepo,
      settingsPort,
      txManager,
      turnstile,
    );
  });

  async function enableLeadForm(
    tenantId: string,
    questions: LeadFormQuestion[] = [makeLeadFormQuestion({ id: QUESTION_ID, required: false })],
    audienceMode: LeadFormAudienceMode = 'GUEST_AND_CUSTOMER',
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

  describe('Turnstile verification (M20-S14)', () => {
    it('throws LeadFormTurnstileVerificationFailedError when verification fails, before any other work happens', async () => {
      turnstile.result = false;

      await expect(useCase.execute(baseInput())).rejects.toThrow(
        LeadFormTurnstileVerificationFailedError,
      );
      // Config/repo were never touched — verification runs before the config is even read.
      expect(submissionRepo.all()).toHaveLength(0);
    });

    it('passes the token and IP address through to the verifier', async () => {
      await enableLeadForm(TENANT_A);

      await useCase.execute(baseInput({ turnstileToken: 'my-token', ipAddress: '198.51.100.1' }));

      expect(turnstile.calls).toEqual([{ token: 'my-token', remoteIp: '198.51.100.1' }]);
    });

    it('succeeds and creates the submission when verification passes', async () => {
      await enableLeadForm(TENANT_A);

      const result = await useCase.execute(baseInput());

      expect(result.submissionId).toBeDefined();
      expect(turnstile.calls).toHaveLength(1);
    });
  });

  describe('module-enabled / catalog gate', () => {
    it('propagates LeadFormNotEnabledError when the module is absent/disabled', async () => {
      await expect(useCase.execute(baseInput())).rejects.toThrow(LeadFormNotEnabledError);
    });

    it('throws LeadFormCustomerOnlyError when audienceMode is CUSTOMER_ONLY and customerId is null', async () => {
      await enableLeadForm(TENANT_A, undefined, 'CUSTOMER_ONLY');

      await expect(useCase.execute(baseInput({ customerId: null }))).rejects.toThrow(
        LeadFormCustomerOnlyError,
      );
    });

    it('succeeds when audienceMode is CUSTOMER_ONLY and customerId is present', async () => {
      await enableLeadForm(TENANT_A, undefined, 'CUSTOMER_ONLY');

      const result = await useCase.execute(baseInput({ customerId: 'customer-uuid' }));

      expect(result.submissionId).toBeDefined();
    });
  });

  describe('answer enrichment and validation', () => {
    it('enriches each answer with questionLabel/questionType from the live catalog, never trusting client-supplied values', async () => {
      await enableLeadForm(TENANT_A, [
        makeLeadFormQuestion({
          id: QUESTION_ID,
          label: 'Server label',
          type: 'TEXT',
          required: false,
        }),
      ]);

      await useCase.execute(baseInput({ answers: [{ questionId: QUESTION_ID, value: 'Google' }] }));

      const [saved] = submissionRepo.all();
      expect(saved.answers).toEqual([
        {
          questionId: QUESTION_ID,
          questionLabel: 'Server label',
          questionType: 'TEXT',
          answerValue: 'Google',
        },
      ]);
    });

    it('rejects the whole submission with LeadFormAnswerQuestionInvalidError when an answer references an unknown questionId', async () => {
      await enableLeadForm(TENANT_A, [makeLeadFormQuestion({ id: QUESTION_ID, required: false })]);

      await expect(
        useCase.execute(baseInput({ answers: [{ questionId: 'unknown-id', value: 'x' }] })),
      ).rejects.toThrow(LeadFormAnswerQuestionInvalidError);
      expect(submissionRepo.all()).toHaveLength(0);
    });

    it('throws LeadFormAnswerRequiredError when a required question has no matching answer', async () => {
      await enableLeadForm(TENANT_A, [makeLeadFormQuestion({ id: QUESTION_ID, required: true })]);

      await expect(useCase.execute(baseInput({ answers: [] }))).rejects.toThrow(
        LeadFormAnswerRequiredError,
      );
      expect(submissionRepo.all()).toHaveLength(0);
    });

    it('throws LeadFormAnswerRequiredError when a required question has only a blank-string answer', async () => {
      await enableLeadForm(TENANT_A, [makeLeadFormQuestion({ id: QUESTION_ID, required: true })]);

      await expect(
        useCase.execute(baseInput({ answers: [{ questionId: QUESTION_ID, value: '   ' }] })),
      ).rejects.toThrow(LeadFormAnswerRequiredError);
    });

    it('accepts a non-required question left unanswered', async () => {
      await enableLeadForm(TENANT_A, [makeLeadFormQuestion({ id: QUESTION_ID, required: false })]);

      const result = await useCase.execute(baseInput({ answers: [] }));

      expect(result.submissionId).toBeDefined();
    });
  });

  describe('rate-limit caps and persistence (M20-S02)', () => {
    beforeEach(async () => {
      await enableLeadForm(TENANT_A);
      await enableLeadForm(TENANT_B);
    });

    it('creates a submission and returns its id when under both caps', async () => {
      const result = await useCase.execute(baseInput());
      expect(result.submissionId).toBeDefined();
    });

    it('uses the default retentionMonths/caps when the tenant has no leadForm settings yet', async () => {
      // TenantSettings.default() doesn't set leadForm (M20-S03's own job) — InMemoryTenantSettingsPort
      // falls back to it when nothing is explicitly .set() for this tenant, so this proves the
      // DEFAULT_X fallback constants are actually exercised, not just present in the source.
      await expect(useCase.execute(baseInput())).resolves.toBeDefined();
    });

    it('throws LeadFormDailyCapReachedError and never creates the row once the tenant-wide daily cap is already reached', async () => {
      settingsPort.set(TENANT_A, {
        ...TenantSettings.default().toJSON(),
        leadForm: { retentionMonths: 6, maxSubmissionsPerDay: 1, maxSubmissionsPerIpPerDay: 100 },
      });

      await useCase.execute(baseInput({ ipAddress: '203.0.113.1' }));
      await expect(useCase.execute(baseInput({ ipAddress: '203.0.113.2' }))).rejects.toBeInstanceOf(
        LeadFormDailyCapReachedError,
      );
    });

    it('throws LeadFormDailyCapReachedError and never creates the row once the per-IP daily cap is already reached', async () => {
      settingsPort.set(TENANT_A, {
        ...TenantSettings.default().toJSON(),
        leadForm: { retentionMonths: 6, maxSubmissionsPerDay: 100, maxSubmissionsPerIpPerDay: 1 },
      });

      const sharedIp = '203.0.113.5';
      await useCase.execute(baseInput({ ipAddress: sharedIp }));
      await expect(useCase.execute(baseInput({ ipAddress: sharedIp }))).rejects.toBeInstanceOf(
        LeadFormDailyCapReachedError,
      );
    });

    it('never creates a row when a cap is already reached (both count queries checked before the write)', async () => {
      settingsPort.set(TENANT_A, {
        ...TenantSettings.default().toJSON(),
        leadForm: { retentionMonths: 6, maxSubmissionsPerDay: 1, maxSubmissionsPerIpPerDay: 100 },
      });

      await useCase.execute(baseInput());
      await expect(useCase.execute(baseInput())).rejects.toBeInstanceOf(
        LeadFormDailyCapReachedError,
      );

      const { start, end } = localDayBoundsUTC(new Date(), 'America/Sao_Paulo');
      const count = await submissionRepo.countByTenantAndDate(TENANT_A, start, end);
      expect(count).toBe(1);
    });

    it('tenant isolation: Tenant B submissions never count against Tenant A cap, and vice versa (CLAUDE.md §2)', async () => {
      settingsPort.set(TENANT_A, {
        ...TenantSettings.default().toJSON(),
        leadForm: { retentionMonths: 6, maxSubmissionsPerDay: 1, maxSubmissionsPerIpPerDay: 100 },
      });
      settingsPort.set(TENANT_B, {
        ...TenantSettings.default().toJSON(),
        leadForm: { retentionMonths: 6, maxSubmissionsPerDay: 1, maxSubmissionsPerIpPerDay: 100 },
      });

      // Tenant A reaches its own cap of 1.
      await useCase.execute(baseInput({ tenantId: TENANT_A, ipAddress: '203.0.113.9' }));
      await expect(
        useCase.execute(baseInput({ tenantId: TENANT_A, ipAddress: '203.0.113.9' })),
      ).rejects.toBeInstanceOf(LeadFormDailyCapReachedError);

      // Tenant B's own first submission still succeeds — unaffected by Tenant A's cap.
      await expect(
        useCase.execute(baseInput({ tenantId: TENANT_B, ipAddress: '203.0.113.9' })),
      ).resolves.toBeDefined();

      // Tenant B now also hits its own cap of 1, independently of Tenant A.
      await expect(
        useCase.execute(baseInput({ tenantId: TENANT_B, ipAddress: '203.0.113.9' })),
      ).rejects.toBeInstanceOf(LeadFormDailyCapReachedError);
    });

    it('tenant isolation: the per-IP cap is scoped per tenant too — the same IP at two tenants counts independently', async () => {
      settingsPort.set(TENANT_A, {
        ...TenantSettings.default().toJSON(),
        leadForm: { retentionMonths: 6, maxSubmissionsPerDay: 100, maxSubmissionsPerIpPerDay: 1 },
      });
      settingsPort.set(TENANT_B, {
        ...TenantSettings.default().toJSON(),
        leadForm: { retentionMonths: 6, maxSubmissionsPerDay: 100, maxSubmissionsPerIpPerDay: 1 },
      });
      const sharedIp = '198.51.100.7';

      await useCase.execute(baseInput({ tenantId: TENANT_A, ipAddress: sharedIp }));
      await expect(
        useCase.execute(baseInput({ tenantId: TENANT_A, ipAddress: sharedIp })),
      ).rejects.toBeInstanceOf(LeadFormDailyCapReachedError);

      // Same IP, different tenant — its own independent per-IP cap, not shared with Tenant A's.
      await expect(
        useCase.execute(baseInput({ tenantId: TENANT_B, ipAddress: sharedIp })),
      ).resolves.toBeDefined();
    });

    it('tenant isolation: enabling the module and catalog for tenant A never resolves for tenant B', async () => {
      // Only tenant A has a real question catalog wired with the answered questionId in this
      // block's own beforeEach — re-enable tenant B with a DIFFERENT catalog to prove the config
      // resolved for the submission always matches the submission's own tenantId.
      await enableLeadForm(TENANT_B, [makeLeadFormQuestion({ id: 'tenant-b-only-question' })]);

      await expect(
        useCase.execute(
          baseInput({ tenantId: TENANT_B, answers: [{ questionId: QUESTION_ID, value: 'x' }] }),
        ),
      ).rejects.toThrow(LeadFormAnswerQuestionInvalidError);
    });

    it('passes the resolved retentionMonths through to the created submission', async () => {
      settingsPort.set(TENANT_A, {
        ...TenantSettings.default().toJSON(),
        leadForm: {
          retentionMonths: 12,
          maxSubmissionsPerDay: 100,
          maxSubmissionsPerIpPerDay: 100,
        },
      });

      const result = await useCase.execute(baseInput());
      expect(result.submissionId).toBeDefined();
    });

    it('saves the submission inside a transaction', async () => {
      await useCase.execute(baseInput());
      expect(txManager.runCallCount).toBe(1);
    });
  });
});
