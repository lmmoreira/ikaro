import { ILeadFormSubmissionRepository } from '../../../contexts/platform/application/ports/lead-form-submission-repository.port';
import { LeadFormSubmission } from '../../../contexts/platform/domain/lead-form-submission.aggregate';

export class InMemoryLeadFormSubmissionRepository implements ILeadFormSubmissionRepository {
  private readonly store = new Map<string, LeadFormSubmission>();

  async save(submission: LeadFormSubmission): Promise<void> {
    this.store.set(submission.id, submission);
    submission.clearDomainEvents();
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
}
