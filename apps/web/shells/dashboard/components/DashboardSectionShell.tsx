import { LocaleProvider } from '@/providers/locale-provider';
import { FormattingProvider } from '@/providers/formatting-provider';
import { TenantProvider } from '@/providers/tenant-provider';
import { DashboardShell } from './DashboardShell';
import { DashboardTopbarStatusProvider } from './topbar-status-context';
import {
  resolveDashboardDateFormat,
  type DashboardShellContext,
} from '../model/dashboard-shell-context';

interface DashboardSectionShellProps {
  readonly shell: DashboardShellContext;
  readonly children: React.ReactNode;
}

// Shared provider + shell wrapper for simple dashboard sections (one shell
// context, no topbar action, no route-derived status key). Sections with
// extra composition needs (e.g. services' topbarAction/service-status key)
// keep their own layout.tsx instead of forcing those needs into this shape.
export function DashboardSectionShell({
  shell,
  children,
}: DashboardSectionShellProps): React.JSX.Element {
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
          <DashboardTopbarStatusProvider>
            <DashboardShell
              tenantName={shell.tenantName}
              tenantSlug={shell.tenantSlug}
              userName={shell.userName}
              role={shell.role}
            >
              {children}
            </DashboardShell>
          </DashboardTopbarStatusProvider>
        </TenantProvider>
      </FormattingProvider>
    </LocaleProvider>
  );
}
