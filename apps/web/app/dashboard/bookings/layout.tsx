import { headers } from 'next/headers';
import { getAccessToken } from '@/lib/auth/get-access-token';
import { notFound } from 'next/navigation';
import { decodeJwtPayload } from '@/lib/auth/decode-jwt';
import { LocaleProvider } from '@/providers/locale-provider';
import { FormattingProvider } from '@/providers/formatting-provider';
import { TenantProvider } from '@/providers/tenant-provider';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DashboardTopbarStatusProvider } from '@/components/dashboard/topbar-status-context';
import { BookingDetailFetchError, fetchStaffBookingDetail } from '@/lib/api/dashboard/bookings';
import { matchBookingDetailRoute } from '@/lib/dashboard/booking-route';
import type { BookingStatus } from '@ikaro/types';
import {
  loadDashboardShellContext,
  resolveDashboardDateFormat,
} from '@/lib/dashboard/dashboard-shell-context';

interface ProtectedLayoutProps {
  readonly children: React.ReactNode;
}

export default async function ProtectedLayout({
  children,
}: ProtectedLayoutProps): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const payload = decodeJwtPayload(token);

  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') ?? '/';
  const bookingRouteMatch = matchBookingDetailRoute(pathname);
  let bookingStatus: BookingStatus | null = null;

  const shell = await loadDashboardShellContext(token, payload);
  if (bookingRouteMatch) {
    try {
      const booking = await fetchStaffBookingDetail(token, bookingRouteMatch.bookingId);
      bookingStatus = booking.status;
    } catch (err) {
      if (err instanceof BookingDetailFetchError && err.status === 404) {
        notFound();
      }
      throw err;
    }
  }

  return (
    <LocaleProvider locale={shell.locale} messages={shell.messages}>
      <FormattingProvider
        locale={shell.formatting.locale}
        currency={shell.formatting.currency}
        timezone={shell.formatting.timezone}
        dateFormat={resolveDashboardDateFormat(shell.formatting)}
        timeFormat={shell.formatting.timeFormat}
      >
        <TenantProvider tenantId={shell.tenantId} tenantSlug={shell.tenantSlug}>
          <DashboardTopbarStatusProvider
            key={bookingRouteMatch?.bookingId ?? 'dashboard-shell'}
            initialBookingStatus={bookingStatus}
          >
            <DashboardShell
              tenantName={shell.tenantName}
              tenantSlug={shell.tenantSlug}
              userName={shell.userName}
              role={shell.role}
            >
              {children}
            </DashboardShell>
          </DashboardTopbarStatusProvider>
        </TenantProvider>
      </FormattingProvider>
    </LocaleProvider>
  );
}
