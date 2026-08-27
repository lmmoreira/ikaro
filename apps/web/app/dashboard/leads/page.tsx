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
    // Fetched unconditionally, even in basic mode — tried gating this on `mode === 'advanced'`
    // (Codex PR #436 round 4 finding: wasteful to run on every basic-mode render for a dropdown
    // only advanced mode shows), but that reintroduced a worse bug: toggleMode() flips the local
    // `mode` state to 'advanced' optimistically, before the router.push() navigation this fetch
    // depends on has resolved, so the advanced dropdown briefly rendered with zero options until
    // the panel's key-based remount caught up — confirmed live as a round-5 CI failure
    // (leads-search.spec.ts's "2 ANDed advanced filters" test, timing out on an option that
    // hadn't loaded yet). The query itself isn't the unbounded scan the finding assumed: it's
    // `WHERE tenant_id = $1` on the same `(tenant_id, submission_id, question_label)` index
    // `applySearch()` already relies on (see ListLeadFormSubmissionsSchema's own doc comment), so
    // it's bounded by this one tenant's own answer-row count, and DISTINCT further caps the
    // *result* to that tenant's own distinct-question-label count — realistically a handful to a
    // few dozen labels over a tenant's whole history, not an unbounded list. A transient failure
    // still must not take down the whole list — the advanced-filter dropdown just renders with no
    // options instead (CodeRabbit PR #436 round 1 finding, 2026-08-27).
    getLeadFormFilterOptions(token).catch(() => ({ questionLabels: [] })),
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
