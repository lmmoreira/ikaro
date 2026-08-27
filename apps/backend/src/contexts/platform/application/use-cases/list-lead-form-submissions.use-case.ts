import { Inject, Injectable } from '@nestjs/common';
import {
  ITenantSettingsPort,
  TENANT_SETTINGS_PORT,
} from '../../../../shared/ports/tenant-settings.port';
import { localDateTimeToUTCIso } from '../../../../shared/utils/calendar-date';
import {
  ILeadFormSubmissionRepository,
  LEAD_FORM_SUBMISSION_REPOSITORY,
} from '../ports/lead-form-submission-repository.port';

export interface ListLeadFormSubmissionsFilterInput {
  questionLabel: string;
  value: string;
}

export interface ListLeadFormSubmissionsUseCaseInput {
  tenantId: string;
  page: number;
  pageSize: number;
  // UC-041 steps 3-5 (M20-S12). `search`/`filters` are already mutually exclusive by the time
  // they reach here (enforced at the Zod boundary) — this use case doesn't re-check it.
  search?: string;
  filters?: ListLeadFormSubmissionsFilterInput[];
  submittedFrom?: string;
  submittedTo?: string;
}

export interface LeadFormSubmissionListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  submittedAt: string;
}

export interface ListLeadFormSubmissionsUseCaseResult {
  items: LeadFormSubmissionListItem[];
  page: number;
  pageSize: number;
  total: number;
}

/** UC-041 main flow steps 1-5 — paginated admin list, ordered submittedAt DESC, with optional
 * basic search / advanced filters / date range layered on top (M20-S12). */
@Injectable()
export class ListLeadFormSubmissionsUseCase {
  constructor(
    @Inject(LEAD_FORM_SUBMISSION_REPOSITORY)
    private readonly submissionRepo: ILeadFormSubmissionRepository,
    @Inject(TENANT_SETTINGS_PORT) private readonly settingsPort: ITenantSettingsPort,
  ) {}

  async execute(
    input: ListLeadFormSubmissionsUseCaseInput,
  ): Promise<ListLeadFormSubmissionsUseCaseResult> {
    const { tenantId, page, pageSize, search, filters, submittedFrom, submittedTo } = input;

    const { submittedFromUtc, submittedToUtc } = await this.resolveDateRange(
      tenantId,
      submittedFrom,
      submittedTo,
    );

    const { items, total } = await this.submissionRepo.findByTenantPaginated(
      tenantId,
      page,
      pageSize,
      {
        search,
        filters,
        submittedFrom: submittedFromUtc,
        submittedTo: submittedToUtc,
      },
    );

    return {
      items: items.map((submission) => ({
        id: submission.id,
        name: submission.name,
        email: submission.email.address,
        phone: submission.phone.value,
        submittedAt: submission.submittedAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    };
  }

  // Tenant settings (for businessHours.timezone) are only fetched when a date range is actually
  // given — every other request (plain pagination, search, or filters alone) skips this I/O
  // entirely. Half-open UTC instant range [submittedFrom's tenant-local midnight, day-after-
  // submittedTo's tenant-local midnight) — both dates inclusive from the caller's own perspective
  // (docs/14-API_CONTRACTS.md § Leads Submissions).
  private async resolveDateRange(
    tenantId: string,
    submittedFrom: string | undefined,
    submittedTo: string | undefined,
  ): Promise<{ submittedFromUtc?: Date; submittedToUtc?: Date }> {
    if (submittedFrom === undefined && submittedTo === undefined) return {};

    const settings = await this.settingsPort.getSettings(tenantId);
    const timezone = settings.businessHours.timezone;

    return {
      submittedFromUtc:
        submittedFrom !== undefined
          ? new Date(localDateTimeToUTCIso(submittedFrom, '00:00', timezone))
          : undefined,
      submittedToUtc:
        submittedTo !== undefined
          ? new Date(localDateTimeToUTCIso(addOneCalendarDay(submittedTo), '00:00', timezone))
          : undefined,
    };
  }
}

// `date` is a plain YYYY-MM-DD string (already validated by the Zod boundary's z.iso.date()) —
// Date-object arithmetic here would need a UTC-anchored construction to avoid the runtime's local
// timezone shifting the calendar day; splitting/rejoining the string avoids that entirely.
function addOneCalendarDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}
