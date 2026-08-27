import { getAccessToken } from '@/features/auth/get-access-token';
import {
  getLeadFormFilterOptions,
  listLeadFormSubmissions,
} from '@/features/platform/api/lead-form-submissions.server';
import {
  parseLeadFormFilters,
  resolveSearchMode,
} from '@/features/platform/model/lead-form-search';
import { LeadFormSubmissionsList } from '@/features/platform/components/leads/LeadFormSubmissionsList';

const PAGE_SIZE = 20;

interface LeadsRouteProps {
  readonly searchParams: Promise<{
    page?: string;
    search?: string;
    filters?: string;
    submittedFrom?: string;
    submittedTo?: string;
    mode?: string;
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
    mode: modeParam,
  } = await searchParams;
  const page = parsePage(pageParam);
  const filters = parseLeadFormFilters(filtersParam);
  const mode = resolveSearchMode({ filters, modeParam });
  // search/filters are mutually exclusive per S12's backend contract — the real UI never sends
  // both, but a hand-edited URL could. filters wins (matches resolveSearchMode()'s own rule: a
  // non-empty filters param already implies advanced mode) so this never forwards a request the
  // BFF is guaranteed to reject with 400 (CodeRabbit PR #436 round 1 finding, 2026-08-27).
  const resolvedSearch = filters ? undefined : search;
  const token = await getAccessToken();

  const [{ items, total }, filterOptions] = await Promise.all([
    listLeadFormSubmissions(token, {
      page,
      pageSize: PAGE_SIZE,
      search: resolvedSearch,
      filters,
      submittedFrom,
      submittedTo,
    }),
    // Only advanced mode's own dropdown ever renders these — fetching them for every basic-mode
    // render (initial load, every page of pagination) was pure waste, repeating a tenant-scoped
    // `SELECT DISTINCT question_label` scan of `lead_form_answers` no caller was going to use
    // (Codex PR #436 round 4 finding, 2026-08-27). A transient failure still must not take down
    // the whole list — the advanced-filter dropdown just renders with no options instead
    // (CodeRabbit PR #436 round 1 finding, 2026-08-27).
    mode === 'advanced'
      ? getLeadFormFilterOptions(token).catch(() => ({ questionLabels: [] }))
      : Promise.resolve({ questionLabels: [] }),
  ]);

  return (
    <LeadFormSubmissionsList
      items={items}
      page={page}
      pageSize={PAGE_SIZE}
      total={total}
      searchQuery={{ search: resolvedSearch, filters, submittedFrom, submittedTo, mode }}
      filterOptionLabels={filterOptions.questionLabels}
    />
  );
}
