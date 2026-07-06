import Link from 'next/link';
import { headers } from 'next/headers';
import { createTranslator } from 'next-intl';
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
import { DashboardTopbarStatusProvider } from '@/shells/dashboard/components/topbar-status-context';

interface TeamLayoutProps {
  readonly children: React.ReactNode;
}

export default async function TeamLayout({
  children,
}: TeamLayoutProps): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const payload = decodeJwtPayload(token);
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') ?? '/dashboard/team';
  const shell = await loadDashboardShellContext(token, payload);
  const t = createTranslator<IntlMessages, 'dashboard.teamPage'>({
    locale: shell.locale,
    messages: shell.messages as IntlMessages,
    namespace: 'dashboard.teamPage',
  });
  const isInviteRoute = pathname === '/dashboard/team/invite';
  const initialStaffRoleStatus = isInviteRoute ? 'STAFF' : null;
  const createAction =
    pathname === '/dashboard/team' ? { href: '/dashboard/team/invite', label: t('invite') } : null;

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
          <DashboardTopbarStatusProvider initialStaffRoleStatus={initialStaffRoleStatus}>
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
