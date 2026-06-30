import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { decodeJwtPayload } from '@/lib/auth/decode-jwt';
import { getAccessToken } from '@/lib/auth/get-access-token';
import { getMessages, resolveSupportedLocale } from '@/lib/i18n/get-messages';
import { LocaleProvider } from '@/providers/locale-provider';
import { FormattingProvider } from '@/providers/formatting-provider';
import { TenantProvider } from '@/providers/tenant-provider';
import { fetchTenantSettings, resolveTenantFormatting } from '@/lib/api/dashboard/tenants';
import { resolveDateFormat } from '@/lib/formatting/locale-validators';
import { getTranslations } from 'next-intl/server';

interface ServicesLayoutProps {
  readonly children: React.ReactNode;
}

export default async function ServicesLayout({
  children,
}: ServicesLayoutProps): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const payload = decodeJwtPayload(token);
  const tenantName = payload.tenantName ?? '';
  const tenantSlug = payload.tenantSlug ?? '';
  const tenantId = payload.tenantId ?? '';
  const userName = payload.userName ?? null;
  const role = (payload.role === 'MANAGER' ? 'MANAGER' : 'STAFF') as 'STAFF' | 'MANAGER';
  const locale = resolveSupportedLocale(payload.locale ?? 'pt-BR');
  const [messages, tenantSettings, t] = await Promise.all([
    getMessages(locale),
    fetchTenantSettings(token),
    getTranslations('dashboard.servicesPage'),
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
            topbarAction={
              <Button asChild size="sm" className="topbar-create-btn hidden lg:inline-flex">
                <Link href="/dashboard/services/new">+ {t('create')}</Link>
              </Button>
            }
          >
            {children}
          </DashboardShell>
        </TenantProvider>
      </FormattingProvider>
    </LocaleProvider>
  );
}
