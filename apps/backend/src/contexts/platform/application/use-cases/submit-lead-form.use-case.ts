import { Injectable } from '@nestjs/common';
import {
  LeadFormAnswerQuestionInvalidError,
  LeadFormAnswerRequiredError,
  LeadFormCustomerOnlyError,
} from '../../domain/errors/lead-form-domain.error';
import { LeadFormAnswer } from '../../domain/lead-form-submission.aggregate';
import {
  CreateLeadFormSubmissionUseCase,
  CreateLeadFormSubmissionUseCaseResult,
} from './create-lead-form-submission.use-case';
import { GetLeadFormPublicConfigUseCase } from './get-lead-form-public-config.use-case';

export interface SubmitLeadFormAnswerInput {
  questionId: string;
  value: string | string[];
}

export interface SubmitLeadFormUseCaseInput {
  tenantId: string;
  customerId: string | null;
  name: string;
  email: string;
  phone: string;
  answers: SubmitLeadFormAnswerInput[];
  ipAddress: string;
  correlationId: string;
}

export type SubmitLeadFormUseCaseResult = CreateLeadFormSubmissionUseCaseResult;

// An array with only blank-string entries (e.g. ["  "]) must count as unanswered too, not just
// an empty array — PR #423 review, CodeRabbit.
function isAnswerEmpty(value: string | string[]): boolean {
  if (Array.isArray(value)) return !value.some((entry) => entry.trim().length > 0);
  return value.trim().length === 0;
}

/**
 * Orchestrates the public POST .../submissions endpoint (M20-S05): re-reads the tenant's live
 * LeadFormConfig (via GetLeadFormPublicConfigUseCase, which also re-checks the module's enabled
 * flag — this is the second HTTP hit of a fill session, the catalog could have changed since the
 * page's own GET), enforces the CUSTOMER_ONLY gate and required-question completeness against
 * that live catalog, enriches each answer into the full snapshot shape
 * LeadFormSubmission.create() requires, then delegates to CreateLeadFormSubmissionUseCase (M20-S02,
 * unchanged) for VO validation, rate-limit caps, persistence, and event publish.
 */
@Injectable()
export class SubmitLeadFormUseCase {
  constructor(
    private readonly getLeadFormPublicConfig: GetLeadFormPublicConfigUseCase,
    private readonly createLeadFormSubmission: CreateLeadFormSubmissionUseCase,
  ) {}

  async execute(input: SubmitLeadFormUseCaseInput): Promise<SubmitLeadFormUseCaseResult> {
    const { tenantId, customerId } = input;

    // Throws LeadFormNotEnabledError (404) if the module is absent/disabled — same check the
    // page's own GET already ran, re-verified here since a submission can arrive well after that
    // read (mirrors defense-in-depth for a config that could have changed mid-fill).
    const config = await this.getLeadFormPublicConfig.execute({ tenantId });

    if (config.audienceMode === 'CUSTOMER_ONLY' && customerId === null) {
      throw new LeadFormCustomerOnlyError();
    }

    const questionById = new Map(config.questions.map((question) => [question.id, question]));

    const enrichedAnswers: LeadFormAnswer[] = input.answers.map((answer, index) => {
      const question = questionById.get(answer.questionId);
      if (!question) {
        throw new LeadFormAnswerQuestionInvalidError(index);
      }
      return {
        questionId: question.id,
        questionLabel: question.label,
        questionType: question.type,
        answerValue: answer.value,
      };
    });

    const answeredQuestionIds = new Set(
      enrichedAnswers
        .filter((answer) => !isAnswerEmpty(answer.answerValue))
        .map((answer) => answer.questionId),
    );
    for (const question of config.questions) {
      if (question.required && !answeredQuestionIds.has(question.id)) {
        throw new LeadFormAnswerRequiredError(question.id);
      }
    }

    return this.createLeadFormSubmission.execute({
      tenantId,
      customerId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      answers: enrichedAnswers,
      ipAddress: input.ipAddress,
      correlationId: input.correlationId,
    });
  }
}
