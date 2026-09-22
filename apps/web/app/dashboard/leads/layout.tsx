import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { DashboardSectionShell } from '@/shells/dashboard/components/DashboardSectionShell';
import { loadDashboardShellContext } from '@/shells/dashboard/model/dashboard-shell-context';

interface LeadsLayoutProps {
  readonly children: React.ReactNode;
}

export default async function LeadsLayout({
  children,
}: LeadsLayoutProps): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const payload = decodeJwtPayload(token);
  const shell = await loadDashboardShellContext(token, payload);

  return <DashboardSectionShell shell={shell}>{children}</DashboardSectionShell>;
}
