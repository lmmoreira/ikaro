import { ILeadFormSubmissionRepository } from '../../../contexts/platform/application/ports/lead-form-submission-repository.port';
import { LeadFormSubmission } from '../../../contexts/platform/domain/lead-form-submission.aggregate';

export class InMemoryLeadFormSubmissionRepository implements ILeadFormSubmissionRepository {
  private readonly store = new Map<string, LeadFormSubmission>();

  async save(submission: LeadFormSubmission): Promise<void> {
    this.store.set(submission.id, submission);
    submission.clearDomainEvents();
  }

  all(): LeadFormSubmission[] {
    return [...this.store.values()];
  }

  async countByTenantAndDate(tenantId: string, from: Date, to: Date): Promise<number> {
    return [...this.store.values()].filter(
      (s) =>
        s.tenantId === tenantId &&
        s.submittedAt.getTime() >= from.getTime() &&
        s.submittedAt.getTime() <= to.getTime(),
    ).length;
  }

  async countByTenantIpAndDate(
    tenantId: string,
    ipAddress: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    return [...this.store.values()].filter(
      (s) =>
        s.tenantId === tenantId &&
        s.ipAddress === ipAddress &&
        s.submittedAt.getTime() >= from.getTime() &&
        s.submittedAt.getTime() <= to.getTime(),
    ).length;
  }

  async findQuestionIdsWithSubmissions(
    tenantId: string,
    questionIds: readonly string[],
  ): Promise<readonly string[]> {
    const ids = new Set(questionIds);
    return [
      ...new Set(
        [...this.store.values()]
          .filter((submission) => submission.tenantId === tenantId)
          .flatMap((submission) => submission.answers.map((answer) => answer.questionId))
          .filter((questionId) => ids.has(questionId)),
      ),
    ];
  }

  async deleteExpired(now: Date): Promise<number> {
    const expired = [...this.store.values()].filter((s) => s.expiresAt.getTime() < now.getTime());
    for (const submission of expired) {
      this.store.delete(submission.id);
    }
    return expired.length;
  }

  async findByTenantPaginated(
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: LeadFormSubmission[]; total: number }> {
    // Mirrors TypeOrmLeadFormSubmissionRepository's submittedAt DESC, id DESC ordering — a tied
    // submittedAt must break the same deterministic way in tests using this fake as it does
    // against the real DB (Codex review finding, PR #428 round 2).
    const all = [...this.store.values()]
      .filter((s) => s.tenantId === tenantId)
      .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime() || (a.id < b.id ? 1 : -1));
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), total: all.length };
  }

  async findById(id: string, tenantId: string): Promise<LeadFormSubmission | null> {
    const submission = this.store.get(id);
    return submission && submission.tenantId === tenantId ? submission : null;
  }
}
