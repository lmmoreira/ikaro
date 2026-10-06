'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { AvailabilityAlertResponse } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { AvailabilityAlertShell } from './AvailabilityAlertShell';
import {
  alertPrimaryButtonClass,
  alertPrimaryButtonStyle,
  alertSecondaryButtonClass,
  alertSecondaryButtonStyle,
} from './availability-alert-styles';

// "Meus avisos" (M23-S12). The cap message points there; the route resolves once S12 lands.
export function myAlertsPath(slug: string): string {
  return `/${slug}/my-account/alerts`;
}

interface SavedProps {
  readonly slug: string;
  readonly alert: AvailabilityAlertResponse;
  readonly serviceName: string;
  readonly email: string;
}

// 201 — the confirmation. One action, "Voltar ao site"; nothing is reserved, and listing or
// cancelling the alert is "Meus avisos" (reached from Minha conta, not offered here).
export function AvailabilityAlertSaved({
  slug,
  alert,
  serviceName,
  email,
}: SavedProps): React.JSX.Element {
  const t = useTranslations('booking');
  const { formatDate, formatTime } = useFormatting();

  const period =
    alert.criteriaType === 'ONE_TIME_RANGE' && alert.acceptableStartAt && alert.acceptableEndAt
      ? `${formatDate(new Date(alert.acceptableStartAt))} ${formatTime(new Date(alert.acceptableStartAt))} – ${formatDate(new Date(alert.acceptableEndAt))} ${formatTime(new Date(alert.acceptableEndAt))}`
      : t('availabilityAlert.saved.weeklySummary', {
          days: (alert.weekdays ?? [])
            .map((day) => t(`availabilityAlert.weekdays.${day}`))
            .join(', '),
          from: alert.localStartTime ?? '',
          to: alert.localEndTime ?? '',
        });

  return (
    <AvailabilityAlertShell testId="availability-alert-saved">
      <h1 className="mb-4 text-2xl font-bold">{t('availabilityAlert.saved.title')}</h1>
      <div
        className="border border-green-300 bg-green-50 p-6 text-green-900"
        style={{ borderRadius: 'var(--ba-radius)' }}
        role="status"
      >
        <p className="font-semibold">{serviceName}</p>
        <p className="mt-2 leading-relaxed">
          {t('availabilityAlert.saved.body', { email })}{' '}
          <strong>{t('availabilityAlert.saved.noReservation')}</strong>
        </p>
        <dl className="mt-4 text-sm">
          <div className="flex justify-between gap-4 border-t border-green-200 py-2">
            <dt className="opacity-70">{t('availabilityAlert.saved.period')}</dt>
            <dd>{period}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-green-200 py-2">
            <dt className="opacity-70">{t('availabilityAlert.saved.activeUntil')}</dt>
            <dd>{formatDate(new Date(alert.expiresAt))}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-6">
        <Link
          href={`/${slug}`}
          data-testid="availability-alert-back-to-site"
          className={alertPrimaryButtonClass}
          style={alertPrimaryButtonStyle}
        >
          {t('availabilityAlert.saved.backToSite')}
        </Link>
      </div>
    </AvailabilityAlertShell>
  );
}

interface CapReachedProps {
  readonly slug: string;
  readonly onBack: () => void;
}

// 409 BOOKING_ALERT_CAP_REACHED — 10 active alerts. Points to "Meus avisos" to cancel one.
export function AvailabilityAlertCapReached({ slug, onBack }: CapReachedProps): React.JSX.Element {
  const t = useTranslations('booking');

  return (
    <AvailabilityAlertShell testId="availability-alert-cap-reached">
      <h1 className="mb-4 text-2xl font-bold">{t('availabilityAlert.cap.title')}</h1>
      <div
        role="alert"
        className="border border-red-300 bg-red-50 p-6 text-red-900"
        style={{ borderRadius: 'var(--ba-radius)' }}
      >
        <p className="leading-relaxed">{t('availabilityAlert.cap.body')}</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className={alertSecondaryButtonClass}
          style={alertSecondaryButtonStyle}
        >
          {t('availabilityAlert.actions.back')}
        </button>
        <Link
          href={myAlertsPath(slug)}
          data-testid="availability-alert-view-alerts"
          className={alertPrimaryButtonClass}
          style={alertPrimaryButtonStyle}
        >
          {t('availabilityAlert.cap.viewAlerts')}
        </Link>
      </div>
    </AvailabilityAlertShell>
  );
}

interface IneligibleProps {
  readonly slug: string;
}

// 422 BOOKING_ALERT_INELIGIBLE_SERVICE, or a missing/unknown/ineligible service in the link (a
// stale or hand-typed URL — the booking flow never offers the button for such a service).
export function AvailabilityAlertIneligible({ slug }: IneligibleProps): React.JSX.Element {
  const t = useTranslations('booking');

  return (
    <AvailabilityAlertShell testId="availability-alert-ineligible">
      <h1 className="mb-4 text-2xl font-bold">{t('availabilityAlert.ineligible.title')}</h1>
      <div
        role="alert"
        className="border border-red-300 bg-red-50 p-6 text-red-900"
        style={{ borderRadius: 'var(--ba-radius)' }}
      >
        <p className="leading-relaxed">{t('availabilityAlert.ineligible.body')}</p>
      </div>
      <div className="mt-6">
        <Link href={`/${slug}`} className={alertPrimaryButtonClass} style={alertPrimaryButtonStyle}>
          {t('availabilityAlert.ineligible.backToSite')}
        </Link>
      </div>
    </AvailabilityAlertShell>
  );
}
