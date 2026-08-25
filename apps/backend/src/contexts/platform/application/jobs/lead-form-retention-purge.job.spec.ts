import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryLeadFormSubmissionRepository } from '../../../../test/repositories/platform/in-memory-lead-form-submission.repository';
import { LeadFormSubmissionBuilder } from '../../../../test/builders/platform';
import { LeadFormRetentionPurgeJob } from './lead-form-retention-purge.job';

const TENANT_A = '10000000-0000-7000-8000-000000000010';
const TENANT_B = '20000000-0000-7000-8000-000000000020';

const NOW = new Date('2026-08-25T03:00:00.000Z');
const BEFORE_CUTOFF = new Date(NOW.getTime() - 1000);
const AFTER_CUTOFF = new Date(NOW.getTime() + 1000);

describe('LeadFormRetentionPurgeJob', () => {
  let submissionRepo: InMemoryLeadFormSubmissionRepository;
  let txManager: InMemoryTransactionManager;
  let job: LeadFormRetentionPurgeJob;

  beforeEach(() => {
    submissionRepo = new InMemoryLeadFormSubmissionRepository();
    txManager = new InMemoryTransactionManager();
    job = new LeadFormRetentionPurgeJob(submissionRepo, txManager);
  });

  it('is a no-op when nothing is expired', async () => {
    const submittedAt = new Date('2026-01-01T12:00:00.000Z'); // LeadFormSubmissionBuilder's default
    const submission = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_A)
      .withExpiresAt(AFTER_CUTOFF)
      .build();
    await submissionRepo.save(submission);

    const result = await job.run(NOW);

    expect(result).toEqual({ submissionsDeleted: 0 });
    // Persistence check, not just the reported count (Codex review finding, PR #422) — a
    // no-op could report 0 while still incorrectly deleting the row.
    expect(
      await submissionRepo.countByTenantAndDate(
        TENANT_A,
        new Date(submittedAt.getTime() - 1000),
        new Date(submittedAt.getTime() + 1000),
      ),
    ).toBe(1);
  });

  it('deletes only submissions past their own expiresAt, keeping ones that have not expired yet', async () => {
    const expired = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_A)
      .withExpiresAt(BEFORE_CUTOFF)
      .build();
    const notYetExpired = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_A)
      .withExpiresAt(AFTER_CUTOFF)
      .build();
    await submissionRepo.save(expired);
    await submissionRepo.save(notYetExpired);

    const result = await job.run(NOW);

    // Exactly 1, not >= 1 — proves the not-yet-expired fixture survives (the boundary AC's
    // whole point), not just that the expired one was deleted.
    expect(result).toEqual({ submissionsDeleted: 1 });
  });

  it('deletes expired submissions across every tenant in one pass', async () => {
    const expiredA = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_A)
      .withExpiresAt(BEFORE_CUTOFF)
      .build();
    const expiredB = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_B)
      .withExpiresAt(BEFORE_CUTOFF)
      .build();
    await submissionRepo.save(expiredA);
    await submissionRepo.save(expiredB);

    const result = await job.run(NOW);

    expect(result).toEqual({ submissionsDeleted: 2 });
  });

  it('is idempotent — running twice in a row deletes nothing new the second time', async () => {
    const expired = new LeadFormSubmissionBuilder()
      .withTenantId(TENANT_A)
      .withExpiresAt(BEFORE_CUTOFF)
      .build();
    await submissionRepo.save(expired);

    const firstRun = await job.run(NOW);
    const secondRun = await job.run(NOW);

    expect(firstRun).toEqual({ submissionsDeleted: 1 });
    expect(secondRun).toEqual({ submissionsDeleted: 0 });
  });
});
