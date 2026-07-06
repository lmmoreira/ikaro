import { getAccessToken } from '@/features/auth/get-access-token';
import { loadTeamDetailRouteData } from '@/shells/dashboard/model/team-route.server';
import { StaffDetailPage } from '@/features/staff/components/team/StaffDetailPage';

interface TeamDetailRouteProps {
  readonly params: Promise<{ id: string }>;
}

export default async function TeamDetailRoute({
  params,
}: TeamDetailRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const token = await getAccessToken();
  const { staff } = await loadTeamDetailRouteData(token, id);

  return <StaffDetailPage staff={staff} />;
}
