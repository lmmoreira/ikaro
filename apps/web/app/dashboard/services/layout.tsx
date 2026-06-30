import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { getAccessToken } from '@/lib/auth/get-access-token';
import { LocaleProvider } from '@/providers/locale-provider';
import { FormattingProvider } from '@/providers/formatting-provider';
import { TenantProvider } from '@/providers/tenant-provider';
import { decodeJwtPayload } from '@/lib/auth/decode-jwt';
import {
  loadDashboardShellContext,
  resolveDashboardDateFormat,
} from '@/lib/dashboard/dashboard-shell-context';
import { getTranslations } from 'next-intl/server';

interface ServicesLayoutProps {
  readonly children: React.ReactNode;
}

export default async function ServicesLayout({
  children,
}: ServicesLayoutProps): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const payload = decodeJwtPayload(token);
  const shell = await loadDashboardShellContext(token, payload);
  const t = await getTranslations('dashboard.servicesPage');
  const createAction = { href: '/dashboard/services/new', label: t('create') };

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
          <DashboardShell
            tenantName={shell.tenantName}
            tenantSlug={shell.tenantSlug}
            userName={shell.userName}
            role={shell.role}
            topbarAction={
              <Button asChild size="sm" className="topbar-create-btn hidden lg:inline-flex">
                <Link href={createAction.href}>+ {createAction.label}</Link>
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
