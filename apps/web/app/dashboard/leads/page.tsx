import { getAccessToken } from '@/features/auth/get-access-token';
import {
  getLeadFormFilterOptions,
  listLeadFormSubmissions,
} from '@/features/platform/api/lead-form-submissions.server';
import { parseLeadFormFilters } from '@/features/platform/model/lead-form-search';
import { LeadFormSubmissionsList } from '@/features/platform/components/leads/LeadFormSubmissionsList';

const PAGE_SIZE = 20;

interface LeadsRouteProps {
  readonly searchParams: Promise<{
    page?: string;
    search?: string;
    filters?: string;
    submittedFrom?: string;
    submittedTo?: string;
  }>;
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
  const {
    page: pageParam,
    search,
    filters: filtersParam,
    submittedFrom,
    submittedTo,
  } = await searchParams;
  const page = parsePage(pageParam);
  const filters = parseLeadFormFilters(filtersParam);
  const token = await getAccessToken();

  const [{ items, total }, filterOptions] = await Promise.all([
    listLeadFormSubmissions(token, {
      page,
      pageSize: PAGE_SIZE,
      search,
      filters,
      submittedFrom,
      submittedTo,
    }),
    getLeadFormFilterOptions(token),
  ]);

  return (
    <LeadFormSubmissionsList
      items={items}
      page={page}
      pageSize={PAGE_SIZE}
      total={total}
      searchQuery={{ search, filters, submittedFrom, submittedTo }}
      filterOptionLabels={filterOptions.questionLabels}
    />
  );
}
