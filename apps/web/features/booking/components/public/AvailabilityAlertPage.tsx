'use client';

import { useTranslations } from 'next-intl';
import { useHotsiteCustomerSession } from '@/features/booking/hooks/useHotsiteCustomerSession';
import { AvailabilityAlertIneligible } from './AvailabilityAlertOutcomeViews';
import { AvailabilityAlertLoginGate } from './AvailabilityAlertLoginGate';
import { AvailabilityAlertShell } from './AvailabilityAlertShell';
import {
  NewAvailabilityAlertForm,
  type AvailabilityAlertFormService,
} from './NewAvailabilityAlertForm';

interface AvailabilityAlertPageProps {
  readonly slug: string;
  // null = the link names no service, an unknown one, or one that does not permit alerts.
  readonly service: AvailabilityAlertFormService | null;
  readonly preferredResourceId: string | null;
  readonly durationMinutes: number | null;
  readonly returnTo: string;
}

// M23-S31 / UC-072 — the alert page of the booking flow. Which of its states shows is decided by
// who is looking: a guest meets the login card (client-side, like the lead form's gate — the API
// is customer-only anyway), a customer sees the form, or the not-eligible state when the link does
// not name a service that permits alerts.
export function AvailabilityAlertPage({
  slug,
  service,
  preferredResourceId,
  durationMinutes,
  returnTo,
}: AvailabilityAlertPageProps): React.JSX.Element {
  const t = useTranslations('booking');
  const session = useHotsiteCustomerSession(slug);

  if (session.status === 'loading') {
    return (
      <AvailabilityAlertShell testId="availability-alert-loading">
        <p className="opacity-75">{t('availabilityAlert.loading')}</p>
      </AvailabilityAlertShell>
    );
  }

  if (session.status === 'guest') {
    return <AvailabilityAlertLoginGate slug={slug} returnTo={returnTo} />;
  }

  if (!service) return <AvailabilityAlertIneligible slug={slug} />;

  return (
    <NewAvailabilityAlertForm
      slug={slug}
      service={service}
      preferredResourceId={preferredResourceId}
      durationMinutes={durationMinutes}
      email={session.profile.email}
    />
  );
}
