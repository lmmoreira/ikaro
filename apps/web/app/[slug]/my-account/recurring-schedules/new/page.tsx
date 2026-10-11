import { z } from 'zod';
import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchCustomerRecurringScheduleOrNull } from '@/features/booking/api/recurring-booking-schedules.server';
import { filterRecurrenceEligibleServices } from '@/features/booking/model/recurring-schedule-form';
import { buildRenewalDraft } from '@/features/booking/model/recurring-schedule-renewal';
import { NewRecurringSchedulePage } from '@/features/customer/components/my-account/NewRecurringSchedulePage';
import { fetchManifest } from '@/features/platform/api.server';
import { fetchServices } from '@/features/platform/hotsite/api/services.server';
import { toISODateInTimezone } from '@/shared/lib/formatting/date-utils';
import { isValidTimezone } from '@/shared/lib/formatting/locale-validators';

interface NewRecurringScheduleRouteProps {
  readonly params: Promise<{ readonly slug: string }>;
  readonly searchParams: Promise<{ readonly renewFrom?: string }>;
}

export default async function NewRecurringScheduleRoute({
  params,
  searchParams,
}: NewRecurringScheduleRouteProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { renewFrom } = await searchParams;
  const services = filterRecurrenceEligibleServices(await fetchServices(slug));

  if (renewFrom === undefined) {
    return <NewRecurringSchedulePage services={services} tenantSlug={slug} />;
  }

  // A link that cannot be honored (unknown, someone else's, pending, cancelled, a service that no
  // longer allows recurrence) opens the blank form with a notice, never an error page.
  const schedule = z.uuid().safeParse(renewFrom).success
    ? await fetchCustomerRecurringScheduleOrNull(await getAccessToken(), renewFrom, slug)
    : null;
  const rawTimezone = (await fetchManifest(slug)).localization.timezone;
  const today = toISODateInTimezone(new Date(), isValidTimezone(rawTimezone) ? rawTimezone : 'UTC');
  const draft = schedule === null ? null : buildRenewalDraft(schedule, services, today);

  return (
    <NewRecurringSchedulePage
      services={services}
      tenantSlug={slug}
      initialDraft={draft ?? undefined}
      renewing={draft === null ? null : schedule}
    />
  );
}
