import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  ITenantSettingsPort,
  TENANT_SETTINGS_PORT,
} from '../../../../shared/ports/tenant-settings.port';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import type { LeadFormSettings } from '../../../../shared/value-objects/tenant-settings-data';
import {
  DEFAULT_LEAD_FORM_RETENTION_MONTHS,
  DEFAULT_MAX_SUBMISSIONS_PER_DAY,
  DEFAULT_MAX_SUBMISSIONS_PER_IP_PER_DAY,
} from '../../lead-form.constants';
import { LeadFormDailyCapReachedError } from '../../domain/errors/lead-form-domain.error';
import { LeadFormAnswer, LeadFormSubmission } from '../../domain/lead-form-submission.aggregate';
import {
  ILeadFormSubmissionRepository,
  LEAD_FORM_SUBMISSION_REPOSITORY,
} from '../ports/lead-form-submission-repository.port';

export interface CreateLeadFormSubmissionUseCaseInput {
  tenantId: string;
  customerId: string | null;
  name: string;
  email: string;
  phone: string;
  answers: LeadFormAnswer[];
  ipAddress: string;
  correlationId: string;
}

export interface CreateLeadFormSubmissionUseCaseResult {
  submissionId: string;
}

@Injectable()
export class CreateLeadFormSubmissionUseCase {
  constructor(
    @Inject(LEAD_FORM_SUBMISSION_REPOSITORY)
    private readonly repo: ILeadFormSubmissionRepository,
    @Inject(TENANT_SETTINGS_PORT) private readonly settingsPort: ITenantSettingsPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: CreateLeadFormSubmissionUseCaseInput,
  ): Promise<CreateLeadFormSubmissionUseCaseResult> {
    const settings = await this.settingsPort.getSettings(input.tenantId);
    const leadFormSettings = settings.leadForm;
    // Bucketed in the tenant's own local calendar day (same mechanism Chatbot's own daily caps
    // use — chatbot-session-resolution.helpers.ts's checkNewSessionVolumeCaps), not a bare UTC
    // day, so a submission near local midnight counts against the correct day from the
    // submitter's own perspective.
    const date = utcDateToLocalDate(new Date(), settings.businessHours.timezone);

    await this.enforceVolumeCaps(input.tenantId, input.ipAddress, date, leadFormSettings);

    const retentionMonths = leadFormSettings?.retentionMonths ?? DEFAULT_LEAD_FORM_RETENTION_MONTHS;

    const submission = LeadFormSubmission.create({
      tenantId: input.tenantId,
      customerId: input.customerId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      answers: input.answers,
      ipAddress: input.ipAddress,
      retentionMonths,
      correlationId: input.correlationId,
    });

    await this.txManager.run(() => this.repo.save(submission));

    return { submissionId: submission.id };
  }

  // Checked before the row is created — mirrors Chatbot's checkNewSessionVolumeCaps() shape (two
  // count queries, one shared error for either layer — "come back tomorrow" from the submitter's
  // perspective regardless of which cap tripped).
  private async enforceVolumeCaps(
    tenantId: string,
    ipAddress: string,
    date: string,
    leadFormSettings: LeadFormSettings | undefined,
  ): Promise<void> {
    const maxPerDay = leadFormSettings?.maxSubmissionsPerDay ?? DEFAULT_MAX_SUBMISSIONS_PER_DAY;
    const dailyCount = await this.repo.countByTenantAndDate(tenantId, date);
    if (dailyCount >= maxPerDay) throw new LeadFormDailyCapReachedError();

    const maxPerIpPerDay =
      leadFormSettings?.maxSubmissionsPerIpPerDay ?? DEFAULT_MAX_SUBMISSIONS_PER_IP_PER_DAY;
    const ipDailyCount = await this.repo.countByTenantIpAndDate(tenantId, ipAddress, date);
    if (ipDailyCount >= maxPerIpPerDay) throw new LeadFormDailyCapReachedError();
  }
}
