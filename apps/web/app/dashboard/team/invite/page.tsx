import { InviteForm } from '@/features/staff/components/team/InviteForm';

interface TeamInviteRouteProps {
  readonly searchParams: Promise<{ email?: string }>;
}

export default async function TeamInviteRoute({
  searchParams,
}: TeamInviteRouteProps): Promise<React.JSX.Element> {
  const { email } = await searchParams;

  return <InviteForm initialEmail={email} />;
}
