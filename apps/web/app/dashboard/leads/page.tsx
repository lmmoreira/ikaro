import { getAccessToken } from '@/features/auth/get-access-token';
import { listLeadFormSubmissions } from '@/features/platform/api/lead-form-submissions.server';
import { LeadFormSubmissionsList } from '@/features/platform/components/leads/LeadFormSubmissionsList';

const PAGE_SIZE = 20;

interface LeadsRouteProps {
  readonly searchParams: Promise<{ page?: string }>;
}

// A fractional or non-finite ?page= (e.g. "1.5", "Infinity") must never reach the BFF/backend
// as-is — falls back to page 1 rather than forwarding a malformed value (Codex PR #435 review).
function parsePage(pageParam?: string): number {
  const parsed = Number(pageParam);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export default async function LeadsPage({
  searchParams,
}: LeadsRouteProps): Promise<React.JSX.Element> {
  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const token = await getAccessToken();
  const { items, total } = await listLeadFormSubmissions(token, { page, pageSize: PAGE_SIZE });

  return <LeadFormSubmissionsList items={items} page={page} pageSize={PAGE_SIZE} total={total} />;
}
