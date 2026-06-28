import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getMessages, resolveSupportedLocale } from '@/lib/i18n/get-messages';
import { decodeJwtPayload } from '@/lib/auth/decode-jwt';
import { resolveDateFormat } from '@/lib/formatting/locale-validators';
import { LocaleProvider } from '@/providers/locale-provider';
import { FormattingProvider } from '@/providers/formatting-provider';
import { TenantProvider } from '@/providers/tenant-provider';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DashboardTopbarStatusProvider } from '@/components/dashboard/topbar-status-context';
import { fetchTenantSettings, resolveTenantFormatting } from '@/lib/api/dashboard/tenants';
import { BookingDetailFetchError, fetchStaffBookingDetail } from '@/lib/api/dashboard/bookings';
import type { BookingStatus } from '@ikaro/types';

interface ProtectedLayoutProps {
  readonly children: React.ReactNode;
}

export default async function ProtectedLayout({
  children,
}: ProtectedLayoutProps): Promise<React.JSX.Element> {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
  const payload = decodeJwtPayload(token);

  // Middleware already rejects non-STAFF/MANAGER tokens before this layout renders.
  const role = (payload.role === 'MANAGER' ? 'MANAGER' : 'STAFF') as 'STAFF' | 'MANAGER';
  const tenantName = payload.tenantName ?? '';
  const tenantSlug = payload.tenantSlug ?? '';
  const tenantId = payload.tenantId ?? '';
  const userName = payload.userName ?? null;
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') ?? '/';
  const bookingRouteMatch = pathname.match(
    /^\/dashboard\/bookings\/([^/]+)(?:\/(complete|reschedule))?$/,
  );
  let bookingStatus: BookingStatus | null = null;

  const locale = resolveSupportedLocale(payload.locale ?? 'pt-BR');
  const [messages, tenantSettings] = await Promise.all([
    getMessages(locale),
    fetchTenantSettings(token),
  ]);
  if (bookingRouteMatch) {
    try {
      const booking = await fetchStaffBookingDetail(token, bookingRouteMatch[1]);
      bookingStatus = booking.status;
    } catch (err) {
      if (err instanceof BookingDetailFetchError && err.status === 404) {
        notFound();
      }
      throw err;
    }
  }
  const formatting = resolveTenantFormatting(tenantSettings);

  return (
    <LocaleProvider locale={locale} messages={messages}>
      <FormattingProvider
        locale={formatting.locale}
        currency={formatting.currency}
        timezone={formatting.timezone}
        dateFormat={resolveDateFormat(formatting.dateFormat)}
        timeFormat={formatting.timeFormat}
      >
        <TenantProvider tenantId={tenantId} tenantSlug={tenantSlug}>
          <DashboardTopbarStatusProvider
            key={bookingRouteMatch?.[1] ?? 'dashboard-shell'}
            initialBookingStatus={bookingStatus}
          >
            <DashboardShell
              tenantName={tenantName}
              tenantSlug={tenantSlug}
              userName={userName}
              role={role}
            >
              {children}
            </DashboardShell>
          </DashboardTopbarStatusProvider>
        </TenantProvider>
      </FormattingProvider>
    </LocaleProvider>
  );
}
