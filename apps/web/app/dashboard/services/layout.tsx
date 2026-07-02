import Link from 'next/link';
import { headers } from 'next/headers';
import { Button } from '@/shared/components/ui/button';
import { DashboardShell } from '@/shells/dashboard/components/DashboardShell';
import { getAccessToken } from '@/features/auth/get-access-token';
import { LocaleProvider } from '@/providers/locale-provider';
import { FormattingProvider } from '@/providers/formatting-provider';
import { TenantProvider } from '@/providers/tenant-provider';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import {
  loadDashboardShellContext,
  resolveDashboardDateFormat,
} from '@/shells/dashboard/model/dashboard-shell-context';
import { loadServiceDetailRouteData } from '@/shells/dashboard/model/service-route.server';
import { matchServiceRoute } from '@/shells/dashboard/model/service-route';
import { DashboardTopbarStatusProvider } from '@/shells/dashboard/components/topbar-status-context';
import { getTranslations } from 'next-intl/server';

interface ServicesLayoutProps {
  readonly children: React.ReactNode;
}

export default async function ServicesLayout({
  children,
}: ServicesLayoutProps): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const payload = decodeJwtPayload(token);
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') ?? '/dashboard/services';
  const shell = await loadDashboardShellContext(token, payload);
  const t = await getTranslations('dashboard.servicesPage');
  const serviceRouteMatch = matchServiceRoute(pathname);
  let initialServiceStatus: 'ACTIVE' | 'INACTIVE' | null =
    pathname === '/dashboard/services/new' ? 'ACTIVE' : null;
  const createAction =
    pathname === '/dashboard/services'
      ? { href: '/dashboard/services/new', label: t('create') }
      : null;

  if (serviceRouteMatch) {
    const { service } = await loadServiceDetailRouteData(token, serviceRouteMatch.serviceId);
    initialServiceStatus = service.isActive ? 'ACTIVE' : 'INACTIVE';
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
            key={serviceRouteMatch?.serviceId ?? 'dashboard-shell'}
            initialServiceStatus={initialServiceStatus}
          >
            <DashboardShell
              tenantName={shell.tenantName}
              tenantSlug={shell.tenantSlug}
              userName={shell.userName}
              role={shell.role}
              topbarAction={
                createAction ? (
                  <Button asChild size="sm" className="topbar-create-btn hidden lg:inline-flex">
                    <Link href={createAction.href}>+ {createAction.label}</Link>
                  </Button>
                ) : null
              }
            >
              {children}
            </DashboardShell>
          </DashboardTopbarStatusProvider>
        </TenantProvider>
      </FormattingProvider>
    </LocaleProvider>
  );
}
