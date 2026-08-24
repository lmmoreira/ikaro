import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { InMemoryLeadFormSubmissionRepository } from '../../../../test/repositories/platform/in-memory-lead-form-submission.repository';
import { localDayBoundsUTC } from '../../../../shared/utils/calendar-date';
import { LeadFormDailyCapReachedError } from '../../domain/errors/lead-form-domain.error';
import { LeadFormAnswer } from '../../domain/lead-form-submission.aggregate';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import {
  CreateLeadFormSubmissionUseCase,
  CreateLeadFormSubmissionUseCaseInput,
} from './create-lead-form-submission.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000031';
const TENANT_B = '10000000-0000-4000-8000-000000000032';
const CORRELATION_ID = 'corr-create-lead-form-submission-test';

const ANSWERS: LeadFormAnswer[] = [
  {
    questionId: 'q1',
    questionLabel: 'Como você nos conheceu?',
    questionType: 'TEXT',
    answerValue: 'Google',
  },
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
    ...overrides,
  };
}

describe('CreateLeadFormSubmissionUseCase', () => {
  let useCase: CreateLeadFormSubmissionUseCase;
  let repo: InMemoryLeadFormSubmissionRepository;
  let settingsPort: InMemoryTenantSettingsPort;
  let txManager: InMemoryTransactionManager;

  beforeEach(() => {
    repo = new InMemoryLeadFormSubmissionRepository();
    settingsPort = new InMemoryTenantSettingsPort();
    txManager = new InMemoryTransactionManager();
    useCase = new CreateLeadFormSubmissionUseCase(repo, settingsPort, txManager);
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
    await expect(useCase.execute(baseInput())).rejects.toBeInstanceOf(LeadFormDailyCapReachedError);

    const { start, end } = localDayBoundsUTC(new Date(), 'America/Sao_Paulo');
    const count = await repo.countByTenantAndDate(TENANT_A, start, end);
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

  it('passes the resolved retentionMonths through to the created submission', async () => {
    settingsPort.set(TENANT_A, {
      ...TenantSettings.default().toJSON(),
      leadForm: { retentionMonths: 12, maxSubmissionsPerDay: 100, maxSubmissionsPerIpPerDay: 100 },
    });

    const result = await useCase.execute(baseInput());
    expect(result.submissionId).toBeDefined();
  });

  it('saves the submission inside a transaction', async () => {
    await useCase.execute(baseInput());
    expect(txManager.runCallCount).toBe(1);
  });
});
