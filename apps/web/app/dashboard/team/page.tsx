import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { fetchStaffList } from '@/features/staff/api';
import { TeamListPage } from '@/features/staff/components/team/TeamListPage';

export default async function TeamPage(): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const payload = decodeJwtPayload(token);
  const staff = await fetchStaffList(token);

  return <TeamListPage members={staff.items} currentStaffId={payload.sub ?? ''} />;
}
