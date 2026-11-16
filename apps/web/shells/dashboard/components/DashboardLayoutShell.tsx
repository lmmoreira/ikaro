import { FeatureGate } from '@/features/billing/components/FeatureGate';
import { LocaleProvider } from '@/providers/locale-provider';
import { FormattingProvider } from '@/providers/formatting-provider';
import { TenantProvider } from '@/providers/tenant-provider';
import type { DashboardShellContext } from '@/shells/dashboard/model/dashboard-shell-context';
import {
  isShellRouteLocked,
  resolveDashboardDateFormat,
} from '@/shells/dashboard/model/dashboard-shell-context';
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
        <TenantProvider tenantId={shell.tenantId} tenantSlug={shell.tenantSlug} role={shell.role}>
          <DashboardTopbarStatusProvider {...topbarStatusProps}>
            <DashboardShell
              tenantName={shell.tenantName}
              tenantSlug={shell.tenantSlug}
              userName={shell.userName}
              role={shell.role}
              leadFormEnabled={shell.leadFormEnabled}
              lockedFeatures={shell.lockedFeatures}
              // A locked route shows the locked page, so the section's create action goes with it.
              topbarAction={isShellRouteLocked(shell) ? null : (topbarAction ?? null)}
            >
              <FeatureGate feature={shell.routeFeature} lockedFeatures={shell.lockedFeatures}>
                {children}
              </FeatureGate>
            </DashboardShell>
          </DashboardTopbarStatusProvider>
        </TenantProvider>
      </FormattingProvider>
    </LocaleProvider>
  );
}
