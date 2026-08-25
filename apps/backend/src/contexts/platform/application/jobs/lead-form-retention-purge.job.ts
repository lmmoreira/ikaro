import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  ILeadFormSubmissionRepository,
  LEAD_FORM_SUBMISSION_REPOSITORY,
} from '../ports/lead-form-submission-repository.port';

export interface LeadFormRetentionPurgeJobResult {
  submissionsDeleted: number;
}

// UC-043: deletes every platform.lead_form_submissions row whose expires_at (computed once per
// submission at insert time from the tenant's retentionMonths at that moment) is now in the
// past, across every tenant in one pass — mirrors ChatbotRetentionPurgeJob's shape exactly.
@Injectable()
export class LeadFormRetentionPurgeJob {
  constructor(
    @Inject(LEAD_FORM_SUBMISSION_REPOSITORY)
    private readonly submissionRepo: ILeadFormSubmissionRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async run(now: Date = new Date()): Promise<LeadFormRetentionPurgeJobResult> {
    return this.txManager.run(async () => {
      const submissionsDeleted = await this.submissionRepo.deleteExpired(now);
      return { submissionsDeleted };
    });
  }
}
