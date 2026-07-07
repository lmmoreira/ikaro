import { notFound } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import { loadTeamDetailRouteData } from '@/shells/dashboard/model/team-route.server';
import { DeactivateConfirmPage } from '@/features/staff/components/team/DeactivateConfirmPage';

interface TeamDeactivateRouteProps {
  readonly params: Promise<{ id: string }>;
}

export default async function TeamDeactivateRoute({
  params,
}: TeamDeactivateRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const token = await getAccessToken();
  const { staff } = await loadTeamDetailRouteData(token, id);

  if (!staff.isActive) notFound();

  return <DeactivateConfirmPage staff={staff} />;
}
