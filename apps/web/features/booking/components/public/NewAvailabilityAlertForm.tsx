'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useAvailabilityAlertForm } from '@/features/booking/hooks/useAvailabilityAlertForm';
import { useResolvedAlertResource } from '@/features/booking/hooks/useResolvedAlertResource';
import type { AvailabilityAlertFieldKey } from '@/features/booking/model/availability-alert-form';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { CriteriaChoice, SummaryRow, WeekdayPicker } from './AvailabilityAlertFields';
import { DateTimeField, ExpirySelect, TimeField } from './AvailabilityAlertPickers';
import {
  AvailabilityAlertCapReached,
  AvailabilityAlertIneligible,
  AvailabilityAlertSaved,
} from './AvailabilityAlertOutcomeViews';
import { AvailabilityAlertShell } from './AvailabilityAlertShell';
import {
  alertPrimaryButtonClass,
  alertPrimaryButtonStyle,
  alertSecondaryButtonClass,
  alertSecondaryButtonStyle,
} from './availability-alert-styles';
import { ErrorAlert } from './ErrorAlert';

export interface AvailabilityAlertFormService {
  readonly id: string;
  readonly name: string;
  readonly durationMinutes: number;
  // A legged service has one resource requirement per leg and a bundle one per requirement; an
  // alert holds one preferred resource, so it shows no resource field and means "when the whole
  // service fits, with any resources".
  readonly isComposite: boolean;
}

interface NewAvailabilityAlertFormProps {
  readonly slug: string;
  readonly service: AvailabilityAlertFormService;
  readonly preferredResourceId: string | null;
  readonly durationMinutes: number | null;
  readonly email: string;
}

export function NewAvailabilityAlertForm({
  slug,
  service,
  preferredResourceId,
  durationMinutes,
  email,
}: NewAvailabilityAlertFormProps): React.JSX.Element {
  const t = useTranslations('booking');
  const { timezone } = useFormatting();
  const { resource, retry: retryResource } = useResolvedAlertResource(
    slug,
    service.id,
    preferredResourceId,
    service.isComposite,
  );
  const state = useAvailabilityAlertForm({ serviceId: service.id, resource, durationMinutes });
  const { form, errors, submitting, view } = state;

  if (view.kind === 'saved') {
    return (
      <AvailabilityAlertSaved
        slug={slug}
        alert={view.alert}
        serviceName={service.name}
        email={email}
      />
    );
  }
  if (view.kind === 'cap') {
    return <AvailabilityAlertCapReached slug={slug} onBack={state.backToForm} />;
  }
  if (view.kind === 'ineligible') return <AvailabilityAlertIneligible slug={slug} />;

  const errorText = (field: AvailabilityAlertFieldKey): string | null => {
    const key = errors[field];
    return key ? t(`availabilityAlert.errors.${key}`) : null;
  };
  const isRange = form.criteriaType === 'ONE_TIME_RANGE';

  return (
    <AvailabilityAlertShell testId="availability-alert-form">
      <h1 className="mb-2 text-2xl font-bold">{t('availabilityAlert.title')}</h1>
      <p className="mb-6 text-sm opacity-75">{t('availabilityAlert.intro')}</p>

      <form noValidate onSubmit={state.submit} className="space-y-6">
        <section aria-labelledby="alert-from-booking">
          <h2
            id="alert-from-booking"
            className="mb-2 text-xs font-bold uppercase tracking-wider opacity-60"
          >
            {t('availabilityAlert.fromBooking.heading')}
          </h2>
          <dl className="text-sm">
            <SummaryRow
              label={t('availabilityAlert.fromBooking.service')}
              value={service.name}
              testId="alert-service"
            />
            {resource.status === 'ready' && (
              <SummaryRow
                label={t('availabilityAlert.fromBooking.resource')}
                value={resource.name}
                testId="alert-resource"
              />
            )}
            <SummaryRow
              label={t('availabilityAlert.fromBooking.duration')}
              value={t('availabilityAlert.fromBooking.minutes', {
                minutes: durationMinutes ?? service.durationMinutes,
              })}
            />
          </dl>
          {resource.status === 'error' && (
            <div className="mt-2" data-testid="alert-resource-error">
              <ErrorAlert onRetry={retryResource} retryLabel={t('errors.tryAgain')}>
                {t('availabilityAlert.resourceError')}
              </ErrorAlert>
            </div>
          )}
          {service.isComposite && (
            <p className="mt-2 text-sm opacity-75" data-testid="alert-composite-note">
              {t('availabilityAlert.legged.note')}
            </p>
          )}
        </section>

        <fieldset>
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider opacity-60">
            {t('availabilityAlert.criteria.heading')}
          </legend>
          <CriteriaChoice
            id="criteria-range"
            checked={isRange}
            disabled={submitting}
            kind="range"
            onSelect={() => state.update({ criteriaType: 'ONE_TIME_RANGE' })}
          />
          <CriteriaChoice
            id="criteria-weekly"
            checked={!isRange}
            disabled={submitting}
            kind="weekly"
            onSelect={() => state.update({ criteriaType: 'WEEKLY_PREFERENCE' })}
          />
        </fieldset>

        {isRange ? (
          <div className="space-y-4">
            <DateTimeField
              rowKey="rangeFrom"
              labelKey="range.from"
              date={form.rangeFromDate}
              time={form.rangeFromTime}
              disabled={submitting}
              error={errorText('rangeFrom')}
              onDateChange={(value) => state.update({ rangeFromDate: value })}
              onTimeChange={(value) => state.update({ rangeFromTime: value })}
            />
            <DateTimeField
              rowKey="rangeTo"
              labelKey="range.to"
              date={form.rangeToDate}
              time={form.rangeToTime}
              disabled={submitting}
              error={errorText('rangeTo')}
              onDateChange={(value) => state.update({ rangeToDate: value })}
              onTimeChange={(value) => state.update({ rangeToTime: value })}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <WeekdayPicker
              selected={form.weekdays}
              disabled={submitting}
              error={errorText('weekdays')}
              onToggle={state.toggleWeekday}
            />
            <TimeField
              rowKey="weeklyFrom"
              labelKey="weekly.from"
              value={form.weeklyFrom}
              disabled={submitting}
              error={errorText('weeklyFrom')}
              onChange={(value) => state.update({ weeklyFrom: value })}
            />
            <TimeField
              rowKey="weeklyTo"
              labelKey="weekly.to"
              value={form.weeklyTo}
              disabled={submitting}
              error={errorText('weeklyTo')}
              onChange={(value) => state.update({ weeklyTo: value })}
            />
            <p className="text-xs opacity-60">
              {t('availabilityAlert.weekly.timezoneHint', { timezone })}
            </p>
          </div>
        )}

        <ExpirySelect
          value={form.expiryDays}
          disabled={submitting}
          onChange={(days) => state.update({ expiryDays: days })}
        />

        <p className="text-xs opacity-60">{t('availabilityAlert.notice', { email })}</p>

        {state.submitError && (
          <div data-testid="alert-submit-error">
            <ErrorAlert focusOnMount hint={t('availabilityAlert.errors.submitFailedHint')}>
              {state.submitError}
            </ErrorAlert>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/${slug}/booking`}
            className={alertSecondaryButtonClass}
            style={alertSecondaryButtonStyle}
          >
            {t('availabilityAlert.actions.back')}
          </Link>
          <button
            type="submit"
            disabled={submitting || resource.status === 'loading' || resource.status === 'error'}
            data-testid="alert-submit"
            className={`cursor-pointer ${alertPrimaryButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
            style={alertPrimaryButtonStyle}
          >
            {submitting
              ? t('availabilityAlert.actions.submitting')
              : t('availabilityAlert.actions.submit')}
          </button>
        </div>
      </form>
    </AvailabilityAlertShell>
  );
}
