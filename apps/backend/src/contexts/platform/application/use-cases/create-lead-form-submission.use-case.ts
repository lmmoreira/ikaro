import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  ITenantSettingsPort,
  TENANT_SETTINGS_PORT,
} from '../../../../shared/ports/tenant-settings.port';
import { localDayBoundsUTC } from '../../../../shared/utils/calendar-date';
import type { LeadFormSettings } from '../../../../shared/value-objects/tenant-settings-data';
import {
  DEFAULT_LEAD_FORM_RETENTION_MONTHS,
  DEFAULT_MAX_SUBMISSIONS_PER_DAY,
  DEFAULT_MAX_SUBMISSIONS_PER_IP_PER_DAY,
} from '../../lead-form.constants';
import {
  LeadFormAnswerQuestionInvalidError,
  LeadFormAnswerRequiredError,
  LeadFormCustomerOnlyError,
  LeadFormDailyCapReachedError,
} from '../../domain/errors/lead-form-domain.error';
import { LeadFormQuestion } from '../../domain/lead-form-config.aggregate';
import { LeadFormAnswer, LeadFormSubmission } from '../../domain/lead-form-submission.aggregate';
import {
  ILeadFormSubmissionRepository,
  LEAD_FORM_SUBMISSION_REPOSITORY,
} from '../ports/lead-form-submission-repository.port';
import { GetLeadFormPublicConfigUseCase } from './get-lead-form-public-config.use-case';

export interface CreateLeadFormSubmissionAnswerInput {
  questionId: string;
  value: string | string[];
}

export interface CreateLeadFormSubmissionUseCaseInput {
  tenantId: string;
  customerId: string | null;
  name: string;
  email: string;
  phone: string;
  answers: CreateLeadFormSubmissionAnswerInput[];
  ipAddress: string;
  correlationId: string;
}

export interface CreateLeadFormSubmissionUseCaseResult {
  submissionId: string;
}

// An array with only blank-string entries (e.g. ["  "]) must count as unanswered too, not just
// an empty array.
function isAnswerEmpty(value: string | string[]): boolean {
  if (Array.isArray(value)) return !value.some((entry) => entry.trim().length > 0);
  return value.trim().length === 0;
}

/**
 * Owns the whole "submit the public lead form" business action (UC-039/UC-040) end to end —
 * there is exactly one caller (LeadFormPublicController's POST .../submissions) and no
 * independent reuse of "create a submission" apart from "submit the form," so this stays one use
 * case rather than an artificial split into a orchestrating "submit" use case delegating to a
 * "create" one (M20-S05 PR #423 review discussion, 2026-08-25).
 *
 * Depends on GetLeadFormPublicConfigUseCase — unlike the submit/create split this replaces, that
 * dependency *is* genuinely justified: GetLeadFormPublicConfigUseCase has two real, independent
 * callers (this use case, and LeadFormPublicController's own GET config endpoint for the page's
 * initial load), so delegating to it here is real reuse, not an artificial seam.
 */
@Injectable()
export class CreateLeadFormSubmissionUseCase {
  constructor(
    private readonly getLeadFormPublicConfig: GetLeadFormPublicConfigUseCase,
    @Inject(LEAD_FORM_SUBMISSION_REPOSITORY)
    private readonly repo: ILeadFormSubmissionRepository,
    @Inject(TENANT_SETTINGS_PORT) private readonly settingsPort: ITenantSettingsPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: CreateLeadFormSubmissionUseCaseInput,
  ): Promise<CreateLeadFormSubmissionUseCaseResult> {
    const { tenantId, customerId } = input;

    // Throws LeadFormNotEnabledError (404) if the module is absent/disabled — the second check
    // of a fill session, re-verified here since a submission can arrive well after the page's own
    // GET (the config could have changed mid-fill).
    const config = await this.getLeadFormPublicConfig.execute({ tenantId });

    if (config.audienceMode === 'CUSTOMER_ONLY' && customerId === null) {
      throw new LeadFormCustomerOnlyError();
    }

    const answers = this.enrichAndValidateAnswers(input.answers, config.questions);

    const settings = await this.settingsPort.getSettings(tenantId);
    const leadFormSettings = settings.leadForm;
    // Bucketed in the tenant's own local calendar day (same intent as Chatbot's own daily caps —
    // chatbot-session-resolution.helpers.ts's checkNewSessionVolumeCaps), so a submission near
    // local midnight counts against the correct day from the submitter's own perspective. Passes
    // real UTC instant boundaries through to the repository rather than a bare date string
    // re-interpreted as a UTC day — see localDayBoundsUTC()'s own doc comment (PR #417 review
    // finding, M20-S02: the earlier version derived a *local* date via utcDateToLocalDate() but
    // the repository then queried it as a *UTC* day, miscounting submissions near local midnight).
    const { start, end } = localDayBoundsUTC(new Date(), settings.businessHours.timezone);

    await this.enforceVolumeCaps(tenantId, input.ipAddress, start, end, leadFormSettings);

    const retentionMonths = leadFormSettings?.retentionMonths ?? DEFAULT_LEAD_FORM_RETENTION_MONTHS;

    const submission = LeadFormSubmission.create({
      tenantId,
      customerId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      answers,
      ipAddress: input.ipAddress,
      retentionMonths,
      correlationId: input.correlationId,
    });

    await this.txManager.run(() => this.repo.save(submission));

    return { submissionId: submission.id };
  }

  // The backend is the only trusted source for questionLabel/questionType — never the raw,
  // client-supplied {questionId, value} pairs the public API accepts. Rejects the whole
  // submission (never silently drops) when an answer references a questionId not in the current
  // catalog, and when a currently-required question has no matching, non-empty answer.
  private enrichAndValidateAnswers(
    rawAnswers: CreateLeadFormSubmissionAnswerInput[],
    questions: LeadFormQuestion[],
  ): LeadFormAnswer[] {
    const questionById = new Map(questions.map((question) => [question.id, question]));

    const answers: LeadFormAnswer[] = rawAnswers.map((answer, index) => {
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
      answers
        .filter((answer) => !isAnswerEmpty(answer.answerValue))
        .map((answer) => answer.questionId),
    );
    for (const question of questions) {
      if (question.required && !answeredQuestionIds.has(question.id)) {
        throw new LeadFormAnswerRequiredError(question.id);
      }
    }

    return answers;
  }

  // Checked before the row is created — mirrors Chatbot's checkNewSessionVolumeCaps() shape (two
  // count queries, one shared error for either layer — "come back tomorrow" from the submitter's
  // perspective regardless of which cap tripped).
  private async enforceVolumeCaps(
    tenantId: string,
    ipAddress: string,
    from: Date,
    to: Date,
    leadFormSettings: LeadFormSettings | undefined,
  ): Promise<void> {
    const maxPerDay = leadFormSettings?.maxSubmissionsPerDay ?? DEFAULT_MAX_SUBMISSIONS_PER_DAY;
    const dailyCount = await this.repo.countByTenantAndDate(tenantId, from, to);
    if (dailyCount >= maxPerDay) throw new LeadFormDailyCapReachedError();

    const maxPerIpPerDay =
      leadFormSettings?.maxSubmissionsPerIpPerDay ?? DEFAULT_MAX_SUBMISSIONS_PER_IP_PER_DAY;
    const ipDailyCount = await this.repo.countByTenantIpAndDate(tenantId, ipAddress, from, to);
    if (ipDailyCount >= maxPerIpPerDay) throw new LeadFormDailyCapReachedError();
  }
}
