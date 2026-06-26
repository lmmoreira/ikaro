import { cookies } from 'next/headers';
import { getMessages, resolveSupportedLocale } from '@/lib/i18n/get-messages';
import { decodeJwtPayload } from '@/lib/auth/decode-jwt';
import { resolveDateFormat } from '@/lib/formatting/locale-validators';
import { LocaleProvider } from '@/providers/locale-provider';
import { FormattingProvider } from '@/providers/formatting-provider';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { fetchTenantFormatting } from '@/lib/api/dashboard/tenants';

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

  const locale = resolveSupportedLocale(payload.locale ?? 'pt-BR');
  const [messages, formatting] = await Promise.all([
    getMessages(locale),
    fetchTenantFormatting(token),
  ]);

  return (
    <LocaleProvider locale={locale} messages={messages}>
      <FormattingProvider
        locale={formatting.locale}
        currency={formatting.currency}
        timezone={formatting.timezone}
        dateFormat={resolveDateFormat(formatting.dateFormat)}
        timeFormat={formatting.timeFormat}
        welcomeStaffScreenDays={formatting.welcomeStaffScreenDays}
      >
        <DashboardShell
          tenantName={tenantName}
          tenantSlug={tenantSlug}
          tenantId={tenantId}
          userName={userName}
          role={role}
        >
          {children}
        </DashboardShell>
      </FormattingProvider>
    </LocaleProvider>
  );
}
