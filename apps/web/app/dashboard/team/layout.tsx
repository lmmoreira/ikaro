import Link from 'next/link';
import { headers } from 'next/headers';
import { createTranslator } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { DashboardLayoutShell } from '@/shells/dashboard/components/DashboardLayoutShell';
import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { loadDashboardShellContext } from '@/shells/dashboard/model/dashboard-shell-context';
import { resolveTeamLayoutPlan } from '@/shells/dashboard/model/team-route';

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
  const { initialStaffRoleStatus, createAction } = resolveTeamLayoutPlan(pathname, t('invite'));

  return (
    <DashboardLayoutShell
      shell={shell}
      topbarStatusProps={{ initialStaffRoleStatus }}
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
