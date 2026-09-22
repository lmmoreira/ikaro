import Link from 'next/link';
import { headers } from 'next/headers';
import { Button } from '@/shared/components/ui/button';
import { DashboardLayoutShell } from '@/shells/dashboard/components/DashboardLayoutShell';
import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { loadDashboardShellContext } from '@/shells/dashboard/model/dashboard-shell-context';
import {
  loadServiceDetailRouteData,
  loadServiceEditRouteData,
} from '@/shells/dashboard/model/service-route.server';
import { matchServiceRoute } from '@/shells/dashboard/model/service-route';
import { createTranslator } from 'next-intl';

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
  const t = createTranslator<IntlMessages, 'dashboard.servicesPage'>({
    locale: shell.locale,
    messages: shell.messages as IntlMessages,
    namespace: 'dashboard.servicesPage',
  });
  const serviceRouteMatch = matchServiceRoute(pathname);
  let initialServiceStatus: 'ACTIVE' | 'INACTIVE' | null =
    pathname === '/dashboard/services/new' ? 'ACTIVE' : null;
  const createAction =
    pathname === '/dashboard/services'
      ? { href: '/dashboard/services/new', label: t('create') }
      : null;

  if (serviceRouteMatch) {
    // The edit page renders the intake schema too, so on that route the layout uses the same
    // composite loader (cache() dedupes it with the page's call); other routes stay service-only.
    const { service } =
      serviceRouteMatch.action === 'edit'
        ? await loadServiceEditRouteData(token, serviceRouteMatch.serviceId)
        : await loadServiceDetailRouteData(token, serviceRouteMatch.serviceId);
    initialServiceStatus = service.isActive ? 'ACTIVE' : 'INACTIVE';
  }

  return (
    <DashboardLayoutShell
      key={serviceRouteMatch?.serviceId ?? 'dashboard-shell'}
      shell={shell}
      topbarStatusProps={{ initialServiceStatus }}
      topbarAction={
        createAction ? (
          <Button asChild size="sm" className="topbar-create-btn hidden lg:inline-flex">
            <Link href={createAction.href}>+ {createAction.label}</Link>
          </Button>
        ) : null
      }
    >
      {children}
    </DashboardLayoutShell>
  );
}
