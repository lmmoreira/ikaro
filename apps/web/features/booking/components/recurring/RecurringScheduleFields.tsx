'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { dateKeyToDate } from '@/features/booking/model/recurring-schedule-display';
import {
  earliestStartDate,
  latestEndsOn,
  resolveMaxTermDays,
  RECURRING_WEEKDAYS,
  type RecurringScheduleDraft,
} from '@/features/booking/model/recurring-schedule-form';
import { FieldFeedback } from '@/shared/components/ui/field-feedback';
import { PillMultiSelect } from '@/shared/components/ui/pill-multi-select';
import { TimePicker } from '@/shared/components/ui/time-picker';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { NewRecurringScheduleDateField } from './NewRecurringScheduleDateField';
import { ResourceFields, type ResourcePicks } from './NewRecurringScheduleResources';
import { ServiceField } from './NewRecurringScheduleServiceFields';
import { RECURRING_FIELD, type RecurringFormFeedback } from './use-recurring-form-feedback';

interface RecurringScheduleFieldsProps {
  /** Already filtered to the recurrence-eligible services. */
  readonly services: readonly HotsiteServiceResponse[];
  /** The service `draft.serviceId` names — the caller has already found it. */
  readonly service: HotsiteServiceResponse;
  readonly draft: RecurringScheduleDraft;
  readonly onChange: (patch: Partial<RecurringScheduleDraft>) => void;
  /** The shell's `useRecurringFormFeedback`: field messages and registration for the focus. */
  readonly form: RecurringFormFeedback;
  /** The shell's title (and banner): inside the card, so the card starts level with the pane. */
  readonly heading?: React.ReactNode;
  /** The resource options of the service, from `useResourcePicks` (the shell reads `blocked` too). */
  readonly picks: ResourcePicks;
}

/**
 * The pattern fields of a recurring reservation (service, resources, weekdays, time, dates) and the
 * messages under them, shared by the customer's creation form and the staff's. Both shells
 * wrap it in their own title, action pane and help text; the rules behind it are the pure model in
 * `features/booking/model/recurring-schedule-form.ts`.
 */
export function RecurringScheduleFields({
  services,
  service,
  draft,
  onChange,
  form,
  heading,
  picks,
}: RecurringScheduleFieldsProps): React.JSX.Element {
  const t = useTranslations('booking.recurringScheduleForm');
  const { timezone, timeFormat, formatDate } = useFormatting();
  const formatDateKey = (dateKey: string): string => formatDate(dateKeyToDate(dateKey));

  const today = earliestStartDate(new Date(), timezone);
  const maxTermDays = resolveMaxTermDays(service);
  const latest = draft.startsOn === '' ? null : latestEndsOn(draft.startsOn, service);
  const latestText = latest === null ? '' : formatDateKey(latest);

  const { fieldErrors, registerField, fieldErrorId } = form;

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-gray-100 bg-white p-4">
      {heading}

      <ServiceField
        services={services}
        serviceId={draft.serviceId}
        onChange={(serviceId) => onChange({ serviceId, resourceIds: [] })}
      />

      <ResourceFields
        service={service}
        draft={draft}
        picks={picks}
        fieldErrors={fieldErrors}
        registerField={registerField}
        onChange={onChange}
      />

      <div ref={registerField(RECURRING_FIELD.weekdays)}>
        <PillMultiSelect
          label={t('fieldWeekdays')}
          values={draft.daysOfWeek}
          options={RECURRING_WEEKDAYS.map((day) => ({
            value: day,
            label: t(`weekdayShort.${day}`),
          }))}
          onChange={(daysOfWeek) => onChange({ daysOfWeek })}
          testId="new-schedule-weekday"
          invalid={Boolean(fieldErrors[RECURRING_FIELD.weekdays])}
          describedBy={
            fieldErrors[RECURRING_FIELD.weekdays]
              ? fieldErrorId(RECURRING_FIELD.weekdays)
              : undefined
          }
        />
        <FieldFeedback id={fieldErrorId(RECURRING_FIELD.weekdays)}>
          {fieldErrors[RECURRING_FIELD.weekdays]}
        </FieldFeedback>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div ref={registerField(RECURRING_FIELD.startTime)}>
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
          <FieldFeedback id={fieldErrorId(RECURRING_FIELD.startTime)}>
            {fieldErrors[RECURRING_FIELD.startTime]}
          </FieldFeedback>
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
          error={fieldErrors[RECURRING_FIELD.startsOn] ?? null}
          fieldRef={registerField(RECURRING_FIELD.startsOn)}
          onChange={(startsOn) => onChange({ startsOn })}
        />
        <NewRecurringScheduleDateField
          testId="new-schedule-ends-on"
          errorTestId="new-schedule-ends-on-error"
          label={t('fieldEndsOn')}
          value={draft.endsOn}
          min={draft.startsOn === '' ? today : draft.startsOn}
          max={latest}
          error={fieldErrors[RECURRING_FIELD.endsOn] ?? null}
          fieldRef={registerField(RECURRING_FIELD.endsOn)}
          onChange={(endsOn) => onChange({ endsOn })}
        />
      </div>
      {latest !== null && (
        <p className="-mt-3 text-xs text-gray-500" data-testid="new-schedule-term-hint">
          {t('endsOnHint', { maxTermDays, latest: latestText })}
        </p>
      )}
    </div>
  );
}
