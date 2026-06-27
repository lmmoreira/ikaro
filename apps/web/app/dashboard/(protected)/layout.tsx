import { cookies } from 'next/headers';
import { getMessages, resolveSupportedLocale } from '@/lib/i18n/get-messages';
import { decodeJwtPayload } from '@/lib/auth/decode-jwt';
import { resolveDateFormat } from '@/lib/formatting/locale-validators';
import { LocaleProvider } from '@/providers/locale-provider';
import { FormattingProvider } from '@/providers/formatting-provider';
import { TenantProvider } from '@/providers/tenant-provider';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { fetchTenantSettings, resolveTenantFormatting } from '@/lib/api/dashboard/tenants';

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
  const [messages, tenantSettings] = await Promise.all([
    getMessages(locale),
    fetchTenantSettings(token),
  ]);
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
          <DashboardShell
            tenantName={tenantName}
            tenantSlug={tenantSlug}
            userName={userName}
            role={role}
          >
            {children}
          </DashboardShell>
        </TenantProvider>
      </FormattingProvider>
    </LocaleProvider>
  );
}
