'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { dateKeyToDate } from '@/features/booking/model/recurring-schedule-display';
import {
  earliestStartDate,
  latestEndsOn,
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
import { NewRecurringScheduleDateField } from './NewRecurringScheduleDateField';
import { ResourceFields, type ResourcePicks } from './NewRecurringScheduleResources';
import { ServiceField } from './NewRecurringScheduleServiceFields';

interface RecurringScheduleFieldsProps {
  /** Already filtered to the recurrence-eligible services. */
  readonly services: readonly HotsiteServiceResponse[];
  /** The service `draft.serviceId` names — the caller has already found it. */
  readonly service: HotsiteServiceResponse;
  readonly draft: RecurringScheduleDraft;
  readonly onChange: (patch: Partial<RecurringScheduleDraft>) => void;
  /** What is wrong with the draft; shown only once the person has tried to continue. */
  readonly issues: readonly DraftIssue[];
  readonly showIssues: boolean;
  /** The backend (or the first-occurrence check) refused the pattern. */
  readonly refusal: PatternRefusal | null;
  /** The resource options of the service, from `useResourcePicks` (the shell reads `blocked` too). */
  readonly picks: ResourcePicks;
}

/**
 * The pattern fields of a recurring reservation (service, resources, weekdays, time, dates) and the
 * refusal notice above them, shared by the customer's creation form and the staff's. Both shells
 * wrap it in their own title, action pane and help text; the rules behind it are the pure model in
 * `features/booking/model/recurring-schedule-form.ts`.
 */
export function RecurringScheduleFields({
  services,
  service,
  draft,
  onChange,
  issues,
  showIssues,
  refusal,
  picks,
}: RecurringScheduleFieldsProps): React.JSX.Element {
  const t = useTranslations('booking.recurringScheduleForm');
  const locale = useResolvedLocale();
  const { timezone, timeFormat, formatDate } = useFormatting();
  const formatDateKey = (dateKey: string): string => formatDate(dateKeyToDate(dateKey));

  const today = earliestStartDate(new Date(), timezone);
  const maxTermDays = resolveMaxTermDays(service);
  const latest = draft.startsOn === '' ? null : latestEndsOn(draft.startsOn, service);
  const latestText = latest === null ? '' : formatDateKey(latest);

  const visible = (issue: DraftIssue): boolean => showIssues && issues.includes(issue);

  function endsOnError(): string | null {
    if (visible('END_REQUIRED') || refusal?.kind === 'END_REQUIRED') return t('errorEndRequired');
    if (visible('END_BEFORE_START') || refusal?.kind === 'END_BEFORE_START') {
      return t('errorEndBeforeStart');
    }
    if (visible('TERM_EXCEEDED') || refusal?.kind === 'TERM_EXCEEDED') {
      const refused = refusal?.kind === 'TERM_EXCEEDED' ? refusal : null;
      return t('errorTermExceeded', {
        maxTermDays: refused?.maxTermDays ?? maxTermDays,
        latest: refused?.latestEndsOn ? formatDateKey(refused.latestEndsOn) : latestText,
      });
    }
    return null;
  }

  const notice =
    refusal?.kind === 'BOOKING_WINDOW' || refusal?.kind === 'NO_OCCURRENCES'
      ? resolveErrorMessage(refusal.code, locale)
      : null;

  return (
    <>
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
          onChange={(serviceId) => onChange({ serviceId, resourceIds: [] })}
        />

        <ResourceFields
          service={service}
          draft={draft}
          picks={picks}
          showRequired={visible('RESOURCE_REQUIRED')}
          onChange={onChange}
        />

        <div>
          <PillMultiSelect
            label={t('fieldWeekdays')}
            values={draft.daysOfWeek}
            options={RECURRING_WEEKDAYS.map((day) => ({
              value: day,
              label: t(`weekdayShort.${day}`),
            }))}
            onChange={(daysOfWeek) => onChange({ daysOfWeek })}
            testId="new-schedule-weekday"
            invalid={visible('WEEKDAY_REQUIRED')}
            describedBy={visible('WEEKDAY_REQUIRED') ? 'new-schedule-weekday-error' : undefined}
          />
          {visible('WEEKDAY_REQUIRED') && (
            <p id="new-schedule-weekday-error" role="alert" className="mt-1 text-xs text-red-600">
              {t('errorWeekdayRequired')}
            </p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-1 block text-sm font-semibold text-gray-900">{t('fieldStartTime')}</p>
            <TimePicker
              value={draft.startTime}
              onChange={(startTime) => onChange({ startTime })}
              timeFormat={timeFormat}
              hourAriaLabel={t('ariaHour')}
              minuteAriaLabel={t('ariaMinute')}
              periodAriaLabel={t('ariaPeriod')}
              hourTestId="new-schedule-time-hour"
              minuteTestId="new-schedule-time-minute"
              periodTestId="new-schedule-time-period"
            />
            {visible('START_TIME_REQUIRED') && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {t('errorStartTimeRequired')}
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 block text-sm font-semibold text-gray-900">{t('fieldDuration')}</p>
            <p className="text-sm text-gray-700" data-testid="new-schedule-duration">
              {t('durationFromService', { duration: formatDuration(service.durationMinutes) })}
            </p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <NewRecurringScheduleDateField
            testId="new-schedule-starts-on"
            errorTestId="new-schedule-starts-on-error"
            label={t('fieldStartsOn')}
            value={draft.startsOn}
            min={today}
            max={null}
            error={visible('START_DATE_REQUIRED') ? t('errorStartDateRequired') : null}
            onChange={(startsOn) => onChange({ startsOn })}
          />
          <NewRecurringScheduleDateField
            testId="new-schedule-ends-on"
            errorTestId="new-schedule-ends-on-error"
            label={t('fieldEndsOn')}
            value={draft.endsOn}
            min={draft.startsOn === '' ? today : draft.startsOn}
            max={latest}
            error={endsOnError()}
            onChange={(endsOn) => onChange({ endsOn })}
          />
        </div>
        {latest !== null && (
          <p className="-mt-3 text-xs text-gray-500" data-testid="new-schedule-term-hint">
            {t('endsOnHint', { maxTermDays, latest: latestText })}
          </p>
        )}
      </div>
    </>
  );
}
