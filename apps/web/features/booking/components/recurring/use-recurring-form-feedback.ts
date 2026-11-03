'use client';

import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { choiceRequirements, isBundleForm } from '@/features/booking/model/recurring-requirements';
import { dateKeyToDate } from '@/features/booking/model/recurring-schedule-display';
import {
  latestEndsOn,
  missingPickIndexes,
  resolveMaxTermDays,
  type DraftIssue,
  type PatternRefusal,
  type RecurringScheduleDraft,
} from '@/features/booking/model/recurring-schedule-form';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { useRequirementText } from './use-requirement-text';

/** The field names `RecurringScheduleFields` registers; a resource group is `resource-<choiceIndex>`. */
export const RECURRING_FIELD = {
  weekdays: 'weekdays',
  startTime: 'start-time',
  startsOn: 'starts-on',
  endsOn: 'ends-on',
} as const;

export const resourceFieldName = (choiceIndex: number): string => `resource-${choiceIndex}`;

export type RecurringFormFeedback = ReturnType<typeof useRecurringFormFeedback>;

type FieldErrors = Record<string, string>;

interface MessageContext {
  readonly t: ReturnType<typeof useTranslations<'booking.recurringScheduleForm'>>;
  readonly text: ReturnType<typeof useRequirementText>;
  readonly formatDateKey: (dateKey: string) => string;
  readonly service: HotsiteServiceResponse | null;
  readonly draft: RecurringScheduleDraft;
}

interface TermLimit {
  readonly maxTermDays: number | null;
  readonly latest: string | null;
}

const NO_LIMIT: TermLimit = { maxTermDays: null, latest: null };

function termExceededMessage(ctx: MessageContext, limit: TermLimit): string {
  const { t, service, draft, formatDateKey } = ctx;
  const fallbackLatest =
    service !== null && draft.startsOn !== '' ? latestEndsOn(draft.startsOn, service) : null;
  const shown = limit.latest ?? fallbackLatest;
  return t('errorTermExceeded', {
    maxTermDays: limit.maxTermDays ?? (service === null ? 0 : resolveMaxTermDays(service)),
    latest: shown === null ? '' : formatDateKey(shown),
  });
}

function endsOnMessage(
  ctx: MessageContext,
  kind: 'END_REQUIRED' | 'END_BEFORE_START' | 'TERM_EXCEEDED',
  limit: TermLimit = NO_LIMIT,
): string {
  if (kind === 'END_REQUIRED') return ctx.t('errorEndRequired');
  if (kind === 'END_BEFORE_START') return ctx.t('errorEndBeforeStart');
  return termExceededMessage(ctx, limit);
}

function resourceErrors(ctx: MessageContext): FieldErrors {
  const { service, draft, text } = ctx;
  if (service === null) return {};
  const bundle = isBundleForm(service);
  const missing = new Set(missingPickIndexes(draft, service));
  const errors: FieldErrors = {};
  for (const line of choiceRequirements(service)) {
    if (!missing.has(line.choiceIndex)) continue;
    errors[resourceFieldName(line.choiceIndex)] = bundle
      ? text.bundleRequiredMessage(line)
      : text.singleRequiredMessage();
  }
  return errors;
}

/** The message each client-side issue puts under its field. */
function issueErrors(ctx: MessageContext, issues: readonly DraftIssue[]): FieldErrors {
  const { t } = ctx;
  const errors: FieldErrors = {};
  for (const issue of issues) {
    if (issue === 'WEEKDAY_REQUIRED') errors[RECURRING_FIELD.weekdays] = t('errorWeekdayRequired');
    if (issue === 'START_TIME_REQUIRED') {
      errors[RECURRING_FIELD.startTime] = t('errorStartTimeRequired');
    }
    if (issue === 'START_DATE_REQUIRED') {
      errors[RECURRING_FIELD.startsOn] = t('errorStartDateRequired');
    }
    if (issue === 'END_REQUIRED' || issue === 'END_BEFORE_START' || issue === 'TERM_EXCEEDED') {
      errors[RECURRING_FIELD.endsOn] = endsOnMessage(ctx, issue);
    }
    if (issue === 'RESOURCE_REQUIRED') Object.assign(errors, resourceErrors(ctx));
  }
  return errors;
}

/** A refusal about the dates belongs to the end-date field; the other kinds belong to no field. */
function refusalFieldErrors(ctx: MessageContext, refusal: PatternRefusal | null): FieldErrors {
  if (refusal?.kind === 'END_REQUIRED' || refusal?.kind === 'END_BEFORE_START') {
    return { [RECURRING_FIELD.endsOn]: endsOnMessage(ctx, refusal.kind) };
  }
  if (refusal?.kind === 'TERM_EXCEEDED') {
    const limit = { maxTermDays: refusal.maxTermDays, latest: refusal.latestEndsOn };
    return { [RECURRING_FIELD.endsOn]: endsOnMessage(ctx, 'TERM_EXCEEDED', limit) };
  }
  return {};
}

/**
 * The feedback of the recurring-schedule pattern form, shared by the customer's and the staff's
 * shell: `present` turns what is wrong with the draft (client issues) or what was refused (the
 * first-occurrence check, the backend) into field marks, the first invalid field's focus and the
 * pane message (`feedback`). A booking-window or no-occurrence refusal belongs to no field, so it is
 * the pane message; the date refusals belong to the end-date field.
 */
export function useRecurringFormFeedback(
  service: HotsiteServiceResponse | null,
  draft: RecurringScheduleDraft,
) {
  const t = useTranslations('booking.recurringScheduleForm');
  const locale = useResolvedLocale();
  const { formatDate } = useFormatting();
  const text = useRequirementText();
  const form = useFormFeedback();
  const { clear, setError, setFieldErrors } = form;

  const present = useCallback(
    (issues: readonly DraftIssue[], refusal: PatternRefusal | null): void => {
      const ctx: MessageContext = {
        t,
        text,
        service,
        draft,
        formatDateKey: (dateKey) => formatDate(dateKeyToDate(dateKey)),
      };
      clear();
      if (refusal?.kind === 'BOOKING_WINDOW' || refusal?.kind === 'NO_OCCURRENCES') {
        setError(resolveErrorMessage(refusal.code, locale));
      }
      setFieldErrors({ ...issueErrors(ctx, issues), ...refusalFieldErrors(ctx, refusal) });
    },
    [clear, draft, formatDate, locale, service, setError, setFieldErrors, t, text],
  );

  // E2E and the specs find the pane message by this id.
  const feedback = useMemo(
    () => (form.feedback === null ? null : { ...form.feedback, testId: 'new-schedule-notice' }),
    [form.feedback],
  );

  return { ...form, feedback, present };
}
