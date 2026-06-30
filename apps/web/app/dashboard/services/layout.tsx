import Link from 'next/link';
import { headers } from 'next/headers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { loadServiceDetailRouteData } from '@/lib/dashboard/service-route.server';
import { matchServiceRoute } from '@/lib/dashboard/service-route';
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
  const createAction =
    pathname === '/dashboard/services'
      ? { href: '/dashboard/services/new', label: t('create') }
      : null;
  let topbarAction: React.ReactNode | null = null;

  if (serviceRouteMatch?.action === 'edit') {
    const { service } = await loadServiceDetailRouteData(token, serviceRouteMatch.serviceId);
    topbarAction = (
      <Badge
        className={`shrink-0 border-0 px-3.5 py-2 text-[0.875rem] font-semibold ${
          service.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {service.isActive ? t('statusActive') : t('statusInactive')}
      </Badge>
    );
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
          <DashboardShell
            tenantName={shell.tenantName}
            tenantSlug={shell.tenantSlug}
            userName={shell.userName}
            role={shell.role}
            topbarAction={
              topbarAction ??
              (createAction ? (
                <Button asChild size="sm" className="topbar-create-btn hidden lg:inline-flex">
                  <Link href={createAction.href}>+ {createAction.label}</Link>
                </Button>
              ) : null)
            }
          >
            {children}
          </DashboardShell>
        </TenantProvider>
      </FormattingProvider>
    </LocaleProvider>
  );
}
