import { LocaleProvider } from '@/providers/locale-provider';
import { FormattingProvider } from '@/providers/formatting-provider';
import { TenantProvider } from '@/providers/tenant-provider';
import type { DashboardShellContext } from '@/shells/dashboard/model/dashboard-shell-context';
import { resolveDashboardDateFormat } from '@/shells/dashboard/model/dashboard-shell-context';
import {
  DashboardTopbarStatusProvider,
  type DashboardTopbarStatusProviderProps,
} from '@/shells/dashboard/components/topbar-status-context';
import { DashboardShell } from '@/shells/dashboard/components/DashboardShell';

interface DashboardLayoutShellProps {
  readonly shell: DashboardShellContext;
  readonly topbarStatusProps?: Omit<DashboardTopbarStatusProviderProps, 'children'>;
  readonly topbarAction?: React.ReactNode;
  readonly children: React.ReactNode;
}

// Shared provider/shell scaffold for every top-level dashboard section layout (services, team,
// ...). Each layout only differs in the topbar status fields it seeds and the topbar action
// button it renders — both are passed in as props here.
export function DashboardLayoutShell({
  shell,
  topbarStatusProps,
  topbarAction,
  children,
}: DashboardLayoutShellProps): React.JSX.Element {
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
          <DashboardTopbarStatusProvider {...topbarStatusProps}>
            <DashboardShell
              tenantName={shell.tenantName}
              tenantSlug={shell.tenantSlug}
              userName={shell.userName}
              role={shell.role}
              topbarAction={topbarAction ?? null}
            >
              {children}
            </DashboardShell>
          </DashboardTopbarStatusProvider>
        </TenantProvider>
      </FormattingProvider>
    </LocaleProvider>
  );
}
