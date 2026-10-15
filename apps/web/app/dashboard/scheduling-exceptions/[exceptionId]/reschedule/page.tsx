import { notFound } from 'next/navigation';
import { SchedulingExceptionReschedulePage } from '@/features/booking/components/dashboard/scheduling-exceptions/SchedulingExceptionReschedulePage';
import { findOpenSchedulingException } from '@/features/booking/api/scheduling-exceptions.server';
import { getAccessToken } from '@/features/auth/get-access-token';
import { resolveReturnTo } from '@/features/booking/model/booking-navigation';
import { loadBookingDetailRouteData } from '@/shells/dashboard/model/booking-route.server';
import { fetchTenantSettings } from '@/features/platform/api/tenant-settings.server';

interface SchedulingExceptionRescheduleRouteProps {
  readonly params: Promise<{ exceptionId: string }>;
  readonly searchParams: Promise<{ returnTo?: string }>;
}

export default async function SchedulingExceptionRescheduleRoute({
  params,
  searchParams,
}: SchedulingExceptionRescheduleRouteProps): Promise<React.JSX.Element> {
  const { exceptionId } = await params;
  const { returnTo } = await searchParams;
  const token = await getAccessToken();

  // Missing, already closed, unreadable or not confirmed (only an APPROVED booking can be
  // rescheduled): there is nothing to reschedule on this route.
  const entry = await findOpenSchedulingException(token, exceptionId);
  if (entry?.booking?.status !== 'APPROVED') notFound();

  // fetchTenantSettings failing must not take down an otherwise-working reschedule flow — same
  // fallback-on-error pattern as dashboard/bookings/[id]/reschedule/page.tsx.
  const [{ booking, tenantSlug }, settings] = await Promise.all([
    loadBookingDetailRouteData(token, entry.affectedId),
    fetchTenantSettings(token).catch(() => null),
  ]);

  return (
    <SchedulingExceptionReschedulePage
      exceptionId={exceptionId}
      booking={booking}
      tenantSlug={tenantSlug}
      maxBookingAdvanceDays={settings?.settings.booking.maxBookingAdvanceDays ?? 90}
      timezone={settings?.settings.businessHours.timezone ?? 'America/Sao_Paulo'}
      returnTo={resolveReturnTo(returnTo)}
    />
  );
}
