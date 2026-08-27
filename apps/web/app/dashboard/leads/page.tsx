import { getAccessToken } from '@/features/auth/get-access-token';
import { listLeadFormSubmissions } from '@/features/platform/api/lead-form-submissions.server';
import { LeadFormSubmissionsList } from '@/features/platform/components/leads/LeadFormSubmissionsList';

const PAGE_SIZE = 20;

interface LeadsRouteProps {
  readonly searchParams: Promise<{ page?: string }>;
}

export default async function LeadsPage({
  searchParams,
}: LeadsRouteProps): Promise<React.JSX.Element> {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const token = await getAccessToken();
  const { items, total } = await listLeadFormSubmissions(token, { page, pageSize: PAGE_SIZE });

  return <LeadFormSubmissionsList items={items} page={page} pageSize={PAGE_SIZE} total={total} />;
}
