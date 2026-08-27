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
    // hadn't loaded yet). Round 6 re-raised this as a cost concern (up to ~730k submissions ×
    // 20 answer rows at the system's absolute ceiling) — but `findDistinctQuestionLabels()`'s own
    // query (`SELECT DISTINCT question_label FROM lead_form_answers WHERE tenant_id = $1 ORDER BY
    // question_label`) maps directly onto `IDX_platform_lead_form_answers_tenant_label`
    // (`(tenant_id, question_label)` — see `1748500000006-CreateLeadFormAnswers.ts`), a dedicated
    // 2-column covering index built for exactly this shape: an index-only scan with the ORDER BY
    // satisfied for free by the index's own sort order and DISTINCT resolved as a cheap adjacent-
    // duplicate elimination over an already-sorted stream — it never touches the heap or needs a
    // separate sort/hash step. A transient failure still must not take down the whole list — the
    // advanced-filter dropdown just renders with no options instead (CodeRabbit PR #436 round 1
    // finding, 2026-08-27).
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
