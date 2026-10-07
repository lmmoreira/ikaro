import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { AvailabilityAlertShell } from './AvailabilityAlertShell';
import {
  alertPrimaryButtonClass,
  alertPrimaryButtonStyle,
  alertSecondaryButtonClass,
  alertSecondaryButtonStyle,
} from './availability-alert-styles';

interface AvailabilityAlertLoginGateProps {
  readonly slug: string;
  // The alert page's own path with its query string — the login returns the visitor here, with
  // the service, resource pick and duration still in the link.
  readonly returnTo: string;
}

// UC-072 A1 — what the alert page shows a visitor with no customer session instead of the form.
// Same pattern as the lead form's LeadFormLoginRequiredGate (M20-S09): a login-required card
// linking to /[slug]/login with a returnTo that points back at this page. The BFF's returnTo
// guard checks only the pathname, so the query string survives the OAuth round-trip.
export function AvailabilityAlertLoginGate({
  slug,
  returnTo,
}: AvailabilityAlertLoginGateProps): React.JSX.Element {
  const t = useTranslations('booking');

  return (
    <AvailabilityAlertShell testId="availability-alert-login-gate">
      <h1 className="mb-4 text-2xl font-bold">{t('availabilityAlert.gate.title')}</h1>
      <div
        className="p-6"
        style={{ backgroundColor: 'var(--ba-secondary)', borderRadius: 'var(--ba-radius)' }}
      >
        <p className="leading-relaxed">{t('availabilityAlert.gate.body')}</p>
        <p className="mt-3 text-sm leading-relaxed opacity-70">{t('availabilityAlert.gate.why')}</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/${slug}/booking`}
          className={alertSecondaryButtonClass}
          style={alertSecondaryButtonStyle}
        >
          {t('availabilityAlert.gate.back')}
        </Link>
        <Link
          href={`/${slug}/login?returnTo=${encodeURIComponent(returnTo)}`}
          data-testid="availability-alert-login-cta"
          className={alertPrimaryButtonClass}
          style={alertPrimaryButtonStyle}
        >
          {t('availabilityAlert.gate.cta')}
        </Link>
      </div>
    </AvailabilityAlertShell>
  );
}
