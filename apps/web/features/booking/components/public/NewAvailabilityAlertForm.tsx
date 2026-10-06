'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useAvailabilityAlertForm } from '@/features/booking/hooks/useAvailabilityAlertForm';
import { useResolvedAlertResource } from '@/features/booking/hooks/useResolvedAlertResource';
import type { AvailabilityAlertFieldKey } from '@/features/booking/model/availability-alert-form';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import {
  CriteriaChoice,
  ExpirySelect,
  LabeledInput,
  SummaryRow,
  WeekdayPicker,
} from './AvailabilityAlertFields';
import {
  AvailabilityAlertCapReached,
  AvailabilityAlertIneligible,
  AvailabilityAlertSaved,
} from './AvailabilityAlertOutcomeViews';
import { AvailabilityAlertShell } from './AvailabilityAlertShell';
import { ErrorAlert } from './ErrorAlert';

export interface AvailabilityAlertFormService {
  readonly id: string;
  readonly name: string;
  readonly durationMinutes: number;
  // A legged service has one resource requirement per leg; an alert holds one preferred resource,
  // so it shows no resource field and means "when the whole journey fits, with any resources".
  readonly hasLegs: boolean;
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
  const resource = useResolvedAlertResource(slug, service.id, preferredResourceId, service.hasLegs);
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
          {service.hasLegs && (
            <p className="mt-2 text-sm opacity-75" data-testid="alert-legged-note">
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
            <LabeledInput
              id="alert-range-from"
              labelKey="range.from"
              type="datetime-local"
              value={form.rangeFrom}
              disabled={submitting}
              error={errorText('rangeFrom')}
              onChange={(value) => state.update({ rangeFrom: value })}
            />
            <LabeledInput
              id="alert-range-to"
              labelKey="range.to"
              type="datetime-local"
              value={form.rangeTo}
              disabled={submitting}
              error={errorText('rangeTo')}
              onChange={(value) => state.update({ rangeTo: value })}
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
            <LabeledInput
              id="alert-weekly-from"
              labelKey="weekly.from"
              type="time"
              value={form.weeklyFrom}
              disabled={submitting}
              error={errorText('weeklyFrom')}
              onChange={(value) => state.update({ weeklyFrom: value })}
            />
            <LabeledInput
              id="alert-weekly-to"
              labelKey="weekly.to"
              type="time"
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
            className="cursor-pointer border px-6 py-3"
            style={{ borderRadius: 'var(--ba-radius)', borderColor: 'var(--ba-secondary)' }}
          >
            {t('availabilityAlert.actions.back')}
          </Link>
          <button
            type="submit"
            disabled={submitting || resource.status === 'loading'}
            data-testid="alert-submit"
            className="cursor-pointer border-2 px-8 py-3 font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              backgroundColor: 'var(--ba-btn-bg)',
              color: 'var(--ba-btn-text)',
              borderColor: 'var(--ba-btn-border)',
              borderRadius: 'var(--ba-radius)',
            }}
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
