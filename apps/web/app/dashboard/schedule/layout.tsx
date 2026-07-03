import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { LocaleProvider } from '@/providers/locale-provider';
import { FormattingProvider } from '@/providers/formatting-provider';
import { TenantProvider } from '@/providers/tenant-provider';
import { DashboardShell } from '@/shells/dashboard/components/DashboardShell';
import {
  loadDashboardShellContext,
  resolveDashboardDateFormat,
} from '@/shells/dashboard/model/dashboard-shell-context';

interface ScheduleLayoutProps {
  readonly children: React.ReactNode;
}

export default async function ScheduleLayout({
  children,
}: ScheduleLayoutProps): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const payload = decodeJwtPayload(token);
  const shell = await loadDashboardShellContext(token, payload);

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
          >
            {children}
          </DashboardShell>
        </TenantProvider>
      </FormattingProvider>
    </LocaleProvider>
  );
}
