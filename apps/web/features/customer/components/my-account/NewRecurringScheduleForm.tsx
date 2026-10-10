'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse, RecurringScheduleWeekday } from '@ikaro/types';
import {
  earliestStartDate,
  latestEndsOn,
  requiresResourceChoice,
  resolveMaxTermDays,
  RECURRING_WEEKDAYS,
  type DraftIssue,
  type PatternRefusal,
  type RecurringScheduleDraft,
} from '@/features/booking/model/recurring-schedule-form';
import { PillMultiSelect } from '@/shared/components/ui/pill-multi-select';
import { TimePicker } from '@/shared/components/ui/time-picker';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { useRecurringResourceOptions } from '../../hooks/useRecurringResourceOptions';
import { recurringScheduleListPath } from '../../recurring-schedule-model';
import { NewRecurringScheduleDateField } from './NewRecurringScheduleDateField';
import { ActionPane, NewRecurringScheduleLayout } from './NewRecurringScheduleLayout';
import { ResourceField, ServiceField } from './NewRecurringScheduleServiceFields';
import { useRecurrenceText } from './use-recurrence-text';

const SHORT_KEY = {
  monday: 'shortMonday',
  tuesday: 'shortTuesday',
  wednesday: 'shortWednesday',
  thursday: 'shortThursday',
  friday: 'shortFriday',
  saturday: 'shortSaturday',
  sunday: 'shortSunday',
} as const satisfies Record<RecurringScheduleWeekday, string>;

interface NewRecurringScheduleFormProps {
  /** Already filtered to the recurrence-eligible services. */
  readonly services: readonly HotsiteServiceResponse[];
  readonly tenantSlug: string;
  readonly draft: RecurringScheduleDraft;
  readonly onChange: (patch: Partial<RecurringScheduleDraft>) => void;
  /** What is wrong with the draft; shown only once the customer has tried to continue. */
  readonly issues: readonly DraftIssue[];
  readonly showIssues: boolean;
  /** The backend (or the first-occurrence check) refused the pattern. */
  readonly refusal: PatternRefusal | null;
  readonly onReview: () => void;
}

export function NewRecurringScheduleForm({
  services,
  tenantSlug,
  draft,
  onChange,
  issues,
  showIssues,
  refusal,
  onReview,
}: NewRecurringScheduleFormProps): React.JSX.Element {
  const t = useTranslations('customer.recurringSchedules');
  const tn = useTranslations('customer.recurringSchedules.new');
  const locale = useResolvedLocale();
  const { timezone, timeFormat } = useFormatting();
  const { formatDateKey } = useRecurrenceText();

  const service = services.find((candidate) => candidate.id === draft.serviceId) ?? null;
  const needsResource = service !== null && requiresResourceChoice(service);

  const resourceOptions = useRecurringResourceOptions(tenantSlug, draft.serviceId, needsResource);
  const firstResourceId = resourceOptions.data?.[0]?.resourceId ?? null;

  // The prototype preselects the first resource: a customer who has no preference does not have to
  // pick one, and the list is never "unselected" with a single resource.
  useEffect(() => {
    if (needsResource && draft.resourceId === null && firstResourceId !== null) {
      onChange({ resourceId: firstResourceId });
    }
  }, [needsResource, draft.resourceId, firstResourceId, onChange]);

  const today = earliestStartDate(new Date(), timezone);
  const maxTermDays = service === null ? null : resolveMaxTermDays(service);
  const latest =
    service === null || draft.startsOn === '' ? null : latestEndsOn(draft.startsOn, service);
  const latestText = latest === null ? '' : formatDateKey(latest);

  const visible = (issue: DraftIssue): boolean => showIssues && issues.includes(issue);

  function endsOnError(): string | null {
    if (visible('END_REQUIRED') || refusal?.kind === 'END_REQUIRED') return tn('errorEndRequired');
    if (visible('END_BEFORE_START') || refusal?.kind === 'END_BEFORE_START') {
      return tn('errorEndBeforeStart');
    }
    if (visible('TERM_EXCEEDED') || refusal?.kind === 'TERM_EXCEEDED') {
      const refused = refusal?.kind === 'TERM_EXCEEDED' ? refusal : null;
      return tn('errorTermExceeded', {
        maxTermDays: refused?.maxTermDays ?? maxTermDays ?? 0,
        latest: refused?.latestEndsOn ? formatDateKey(refused.latestEndsOn) : latestText,
      });
    }
    return null;
  }

  const notice =
    refusal?.kind === 'BOOKING_WINDOW' || refusal?.kind === 'NO_OCCURRENCES'
      ? resolveErrorMessage(refusal.code, locale)
      : null;
  const aside =
    (showIssues && issues.length > 0) || refusal !== null
      ? tn('validationAside')
      : tn('draftAside');

  function renderPane(): React.JSX.Element {
    return (
      <ActionPane aside={aside}>
        <button
          type="button"
          data-testid="new-schedule-review"
          disabled={service === null}
          onClick={onReview}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {tn('reviewButton')}
        </button>
        <Link
          href={recurringScheduleListPath(tenantSlug)}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          {tn('cancelButton')}
        </Link>
      </ActionPane>
    );
  }

  if (service === null) {
    return (
      <div className="w-full" data-testid="new-schedule-no-services">
        <h1 className="text-lg font-bold text-gray-900">{tn('title')}</h1>
        <p className="mt-3 text-sm text-gray-500">{tn('noServices')}</p>
      </div>
    );
  }

  return (
    <NewRecurringScheduleLayout testId="new-schedule-form" pane={renderPane()}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {tn('stepPattern')}
        </p>
        <h1 className="mt-1 text-lg font-bold text-gray-900">{tn('title')}</h1>
      </div>

      {notice !== null && (
        <div
          role="alert"
          data-testid="new-schedule-notice"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {notice}
        </div>
      )}

      <div className="flex flex-col gap-5 rounded-xl border border-gray-100 bg-white p-4">
        <ServiceField
          services={services}
          serviceId={draft.serviceId}
          onChange={(serviceId) => onChange({ serviceId, resourceId: null })}
        />

        {needsResource && (
          <ResourceField
            query={resourceOptions}
            resourceId={draft.resourceId}
            required={visible('RESOURCE_REQUIRED')}
            onChange={(resourceId) => onChange({ resourceId })}
          />
        )}

        <div>
          <PillMultiSelect
            label={tn('fieldWeekdays')}
            values={draft.daysOfWeek}
            options={RECURRING_WEEKDAYS.map((day) => ({ value: day, label: t(SHORT_KEY[day]) }))}
            onChange={(daysOfWeek) => onChange({ daysOfWeek })}
            testId="new-schedule-weekday"
            invalid={visible('WEEKDAY_REQUIRED')}
            describedBy={visible('WEEKDAY_REQUIRED') ? 'new-schedule-weekday-error' : undefined}
          />
          {visible('WEEKDAY_REQUIRED') && (
            <p id="new-schedule-weekday-error" role="alert" className="mt-1 text-xs text-red-600">
              {tn('errorWeekdayRequired')}
            </p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-1 block text-sm font-semibold text-gray-900">{tn('fieldStartTime')}</p>
            <TimePicker
              value={draft.startTime}
              onChange={(startTime) => onChange({ startTime })}
              timeFormat={timeFormat}
              hourAriaLabel={tn('ariaHour')}
              minuteAriaLabel={tn('ariaMinute')}
              periodAriaLabel={tn('ariaPeriod')}
              hourTestId="new-schedule-time-hour"
              minuteTestId="new-schedule-time-minute"
              periodTestId="new-schedule-time-period"
            />
            {visible('START_TIME_REQUIRED') && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {tn('errorStartTimeRequired')}
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 block text-sm font-semibold text-gray-900">{tn('fieldDuration')}</p>
            <p className="text-sm text-gray-700" data-testid="new-schedule-duration">
              {tn('durationFromService', { duration: formatDuration(service.durationMinutes) })}
            </p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <NewRecurringScheduleDateField
            testId="new-schedule-starts-on"
            errorTestId="new-schedule-starts-on-error"
            label={tn('fieldStartsOn')}
            value={draft.startsOn}
            min={today}
            max={null}
            error={visible('START_DATE_REQUIRED') ? tn('errorStartDateRequired') : null}
            onChange={(startsOn) => onChange({ startsOn })}
          />
          <NewRecurringScheduleDateField
            testId="new-schedule-ends-on"
            errorTestId="new-schedule-ends-on-error"
            label={tn('fieldEndsOn')}
            value={draft.endsOn}
            min={draft.startsOn === '' ? today : draft.startsOn}
            max={latest}
            error={endsOnError()}
            onChange={(endsOn) => onChange({ endsOn })}
          />
        </div>
        {maxTermDays !== null && latest !== null && (
          <p className="-mt-3 text-xs text-gray-500" data-testid="new-schedule-term-hint">
            {tn('endsOnHint', { maxTermDays, latest: latestText })}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">{tn('howTitle')}</p>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">{tn('howBody')}</p>
      </div>
    </NewRecurringScheduleLayout>
  );
}
