import { ILeadFormSubmissionRepository } from '../../../contexts/platform/application/ports/lead-form-submission-repository.port';
import { LeadFormSubmission } from '../../../contexts/platform/domain/lead-form-submission.aggregate';
import { endOfDayUTC, startOfDayUTC } from '../../../shared/utils/calendar-date';

export class InMemoryLeadFormSubmissionRepository implements ILeadFormSubmissionRepository {
  private readonly store = new Map<string, LeadFormSubmission>();

  async save(submission: LeadFormSubmission): Promise<void> {
    this.store.set(submission.id, submission);
    submission.clearDomainEvents();
  }

  async countByTenantAndDate(tenantId: string, date: string): Promise<number> {
    const start = new Date(startOfDayUTC(date)).getTime();
    const end = new Date(endOfDayUTC(date)).getTime();
    return [...this.store.values()].filter(
      (s) =>
        s.tenantId === tenantId &&
        s.submittedAt.getTime() >= start &&
        s.submittedAt.getTime() <= end,
    ).length;
  }

  async countByTenantIpAndDate(tenantId: string, ipAddress: string, date: string): Promise<number> {
    const start = new Date(startOfDayUTC(date)).getTime();
    const end = new Date(endOfDayUTC(date)).getTime();
    return [...this.store.values()].filter(
      (s) =>
        s.tenantId === tenantId &&
        s.ipAddress === ipAddress &&
        s.submittedAt.getTime() >= start &&
        s.submittedAt.getTime() <= end,
    ).length;
  }
}
