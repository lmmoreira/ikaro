import { Inject, Injectable } from '@nestjs/common';
import {
  ILeadFormSubmissionRepository,
  LEAD_FORM_SUBMISSION_REPOSITORY,
} from '../ports/lead-form-submission-repository.port';

export interface GetLeadFormFilterOptionsUseCaseInput {
  tenantId: string;
}

export interface GetLeadFormFilterOptionsUseCaseResult {
  questionLabels: string[];
}

/** UC-041 step 4's advanced-filter dropdown (M20-S12). Deliberately includes labels from
 * questions since edited or removed from the live LeadFormConfig — matches the submission's own
 * snapshot, not the current config (docs/13-DATABASE_SCHEMA.md § platform.lead_form_answers). */
@Injectable()
export class GetLeadFormFilterOptionsUseCase {
  constructor(
    @Inject(LEAD_FORM_SUBMISSION_REPOSITORY)
    private readonly submissionRepo: ILeadFormSubmissionRepository,
  ) {}

  async execute(
    input: GetLeadFormFilterOptionsUseCaseInput,
  ): Promise<GetLeadFormFilterOptionsUseCaseResult> {
    const questionLabels = await this.submissionRepo.findDistinctQuestionLabels(input.tenantId);
    return { questionLabels };
  }
}
