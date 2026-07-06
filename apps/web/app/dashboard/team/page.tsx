import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { fetchStaffList } from '@/features/staff/api';
import { TeamListPage } from '@/features/staff/components/team/TeamListPage';

interface TeamRouteProps {
  readonly searchParams: Promise<{ invited?: string }>;
}

export default async function TeamPage({
  searchParams,
}: TeamRouteProps): Promise<React.JSX.Element> {
  const { invited } = await searchParams;
  const token = await getAccessToken();
  const payload = decodeJwtPayload(token);
  const staff = await fetchStaffList(token);

  // A valid JWT always carries sub — a missing one means the token is corrupt/malformed,
  // which middleware should already have rejected. Fail fast instead of defaulting to '',
  // which would make the current user look like "not themselves" and show a Deactivate
  // action on their own row that then errors server-side on click.
  if (!payload.sub) {
    throw new Error('Invalid session: missing user id');
  }

  return (
    <TeamListPage
      members={staff.items}
      currentStaffId={payload.sub}
      hasMore={staff.pagination.hasMore}
      invitedEmail={invited}
    />
  );
}
