import { Inject, Injectable } from '@nestjs/common';
import { LeadFormQuestionType } from '../../domain/lead-form-submission.aggregate';
import { LeadFormSubmissionNotFoundError } from '../../domain/errors/lead-form-domain.error';
import {
  ILeadFormSubmissionRepository,
  LEAD_FORM_SUBMISSION_REPOSITORY,
} from '../ports/lead-form-submission-repository.port';

export interface GetLeadFormSubmissionUseCaseInput {
  tenantId: string;
  submissionId: string;
}

export interface LeadFormSubmissionAnswerResult {
  questionLabel: string;
  questionType: LeadFormQuestionType;
  answerValue: string | string[];
}

export interface GetLeadFormSubmissionUseCaseResult {
  id: string;
  name: string;
  email: string;
  phone: string;
  answers: LeadFormSubmissionAnswerResult[];
  submittedAt: string;
  // Set when the submitter was an authenticated customer at submission time, null for a guest —
  // powers the admin detail page's guest/customer indicator (M20-S10).
  customerId: string | null;
}

/**
 * UC-041 main flow step 6 — read-only detail view. `answers` is served entirely from the
 * submission's own JSONB snapshot (docs/02-DOMAIN_MODEL.md § LeadFormSubmission) — never a live
 * lookup against LeadFormConfig's current question catalog, so a since-edited/removed question
 * still renders exactly as it was answered (UC-041 A2).
 */
@Injectable()
export class GetLeadFormSubmissionUseCase {
  constructor(
    @Inject(LEAD_FORM_SUBMISSION_REPOSITORY)
    private readonly submissionRepo: ILeadFormSubmissionRepository,
  ) {}

  async execute(
    input: GetLeadFormSubmissionUseCaseInput,
  ): Promise<GetLeadFormSubmissionUseCaseResult> {
    const { tenantId, submissionId } = input;
    const submission = await this.submissionRepo.findById(submissionId, tenantId);
    if (!submission) throw new LeadFormSubmissionNotFoundError(submissionId);

    return {
      id: submission.id,
      name: submission.name,
      email: submission.email.address,
      phone: submission.phone.value,
      answers: submission.answers.map((answer) => ({
        questionLabel: answer.questionLabel,
        questionType: answer.questionType,
        answerValue: answer.answerValue,
      })),
      submittedAt: submission.submittedAt.toISOString(),
      customerId: submission.customerId,
    };
  }
}
