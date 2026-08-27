// UC-041 steps 3-5 (M20-S13) — pure query-shape helpers shared by the search panel (Aplicar/
// Limpar/mode toggle navigation) and the submissions list's own pagination links, so paging
// through a filtered result set preserves the active search/filters/date range.

export interface LeadFormSearchFilterEntry {
  readonly questionLabel: string;
  readonly value: string;
}

export interface LeadFormSearchQuery {
  readonly search?: string;
  readonly filters?: readonly LeadFormSearchFilterEntry[];
  readonly submittedFrom?: string;
  readonly submittedTo?: string;
}

export const MAX_FILTER_ROWS = 5;

// Non-empty is the only requirement (docs/14-API_CONTRACTS.md § Leads Submissions) — no
// 3-character minimum. The backend's pg_trgm index genuinely can't accelerate a pattern under 3
// characters, but at this feature's real per-tenant volume caps an occasional un-indexed full
// scan is cheap enough not to matter, and rejecting a short-but-real term (an age, "25") was a
// usability regression with no real performance benefit at this scale (M20-S13 implementation,
// 2026-08-27, reversing the story's own original 3-character-minimum design).
export function isSearchTermValid(term: string): boolean {
  return term.trim().length > 0;
}

// A stable client-only `id` per row is needed for React list keys — an advanced-filter row has
// no natural identity of its own (two rows can share the same, still-empty questionLabel/value
// while being edited), and the array index shifts on every add/remove (SonarCloud S6479, the
// same array-index-as-key smell LeadFormSubmissionsList's own pagination window already avoids).
// `id` is UI-local only — stripped before a row is sent as part of a `filters` request.
export interface LeadFormEditableFilterRow extends LeadFormSearchFilterEntry {
  readonly id: string;
}

export function createEmptyFilterRow(): LeadFormEditableFilterRow {
  return { id: crypto.randomUUID(), questionLabel: '', value: '' };
}

export function toEditableFilterRows(
  entries: readonly LeadFormSearchFilterEntry[] | undefined,
): LeadFormEditableFilterRow[] {
  if (!entries || entries.length === 0) return [createEmptyFilterRow()];
  return entries.map((entry) => ({ id: crypto.randomUUID(), ...entry }));
}

// Parses the `filters` query param (a URL-encoded JSON array string) back into a typed array
// for pre-filling the advanced-filter UI on load (a direct link, a back-navigation). A
// hand-edited or stale URL that doesn't parse/match the expected shape fails open to
// "no filters" rather than crashing the page — but it must fail open all the way to matching
// the backend's own bounds (non-empty questionLabel/value, capped at MAX_FILTER_ROWS), not just
// the outer JSON/type shape: `listLeadFormSubmissions` throws on a non-2xx response, so forwarding
// an entry the backend is guaranteed to reject (an empty value, a 6th entry) would crash the
// whole page load instead of degrading gracefully (CodeRabbit PR #436 round 1 finding,
// 2026-08-27).
export function parseLeadFormFilters(
  raw: string | undefined,
): LeadFormSearchFilterEntry[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const entries = parsed
      .filter(
        (entry): entry is LeadFormSearchFilterEntry =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as Record<string, unknown>).questionLabel === 'string' &&
          typeof (entry as Record<string, unknown>).value === 'string' &&
          (entry as LeadFormSearchFilterEntry).questionLabel.trim().length > 0 &&
          isSearchTermValid((entry as LeadFormSearchFilterEntry).value),
      )
      .slice(0, MAX_FILTER_ROWS);
    return entries.length > 0 ? entries : undefined;
  } catch {
    return undefined;
  }
}

interface BuildLeadsSearchQueryParams extends LeadFormSearchQuery {
  readonly page?: number;
}

// Builds the `/dashboard/leads` query string for a given filter state. `page` is omitted
// whenever it's the default (1) so plain unfiltered/first-page links stay clean.
export function buildLeadsSearchQuery(params: BuildLeadsSearchQueryParams): string {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.filters && params.filters.length > 0) {
    query.set('filters', JSON.stringify(params.filters));
  }
  if (params.submittedFrom) query.set('submittedFrom', params.submittedFrom);
  if (params.submittedTo) query.set('submittedTo', params.submittedTo);
  if (params.page !== undefined && params.page > 1) query.set('page', String(params.page));
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}
