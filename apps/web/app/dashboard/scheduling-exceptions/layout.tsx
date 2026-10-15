import { DashboardLayoutShell } from '@/shells/dashboard/components/DashboardLayoutShell';
import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { loadDashboardShellContext } from '@/shells/dashboard/model/dashboard-shell-context';

interface SchedulingExceptionsLayoutProps {
  readonly children: React.ReactNode;
}

// Shell-wrapped like every dashboard section (docs/16): the list and the reschedule drill-down
// both render inside it. MANAGER-only is enforced by proxy.ts (MANAGER_ONLY_ROUTES).
export default async function SchedulingExceptionsLayout({
  children,
}: SchedulingExceptionsLayoutProps): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const payload = decodeJwtPayload(token);
  const shell = await loadDashboardShellContext(token, payload);

  return <DashboardLayoutShell shell={shell}>{children}</DashboardLayoutShell>;
}
