'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { LeadFormSubmissionListItem } from '@ikaro/types';
import { Card } from '@/shared/components/ui/card';
import { getInitials } from '@/shared/utils/initials';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import {
  buildLeadsSearchQuery,
  type LeadFormSearchQuery,
} from '@/features/platform/model/lead-form-search';
import { LeadFormSearchPanel } from './LeadFormSearchPanel';

interface LeadFormSubmissionsListProps {
  readonly items: readonly LeadFormSubmissionListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly searchQuery: LeadFormSearchQuery;
  readonly filterOptionLabels: readonly string[];
}

function hasActiveQuery(query: LeadFormSearchQuery): boolean {
  return Boolean(
    query.search ||
    (query.filters && query.filters.length > 0) ||
    query.submittedFrom ||
    query.submittedTo,
  );
}

function buildPageHref(query: LeadFormSearchQuery, page: number): string {
  return `/dashboard/leads${buildLeadsSearchQuery({ ...query, page })}`;
}

const PAGE_WINDOW_DELTA = 2;

type PageWindowEntry =
  | { readonly type: 'page'; readonly value: number }
  | { readonly type: 'ellipsis'; readonly key: string };

// Bounded page-number window (max ~9 entries: first, last, up to 5 around current, 2 ellipses) —
// renders the same DOM size regardless of totalPages. Without this, a tenant retaining up to
// 24 months of submissions at up to 1,000/day rendered one link per page, unbounded (Codex PR
// #435 review). Each ellipsis carries a key derived from the page number right after it (a
// window has at most 2 ellipses, each preceding a distinct page, so this is always unique —
// avoids the array-index-as-key smell, SonarCloud S6479).
function buildPageWindow(current: number, total: number): readonly PageWindowEntry[] {
  const pages = new Set<number>([1, total]);
  for (let p = current - PAGE_WINDOW_DELTA; p <= current + PAGE_WINDOW_DELTA; p++) {
    if (p >= 1 && p <= total) pages.add(p);
  }
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: PageWindowEntry[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous !== 0 && p - previous > 1) {
      result.push({ type: 'ellipsis', key: `ellipsis-before-${p}` });
    }
    result.push({ type: 'page', value: p });
    previous = p;
  }
  return result;
}

// page.tsx re-fetches server-side via URL navigation (search panel's Aplicar/Limpar, or a
// pagination Link) — no client-side list-fetching state needed here.
export function LeadFormSubmissionsList({
  items,
  page,
  pageSize,
  total,
  searchQuery,
  filterOptionLabels,
}: LeadFormSubmissionsListProps): React.JSX.Element {
  const t = useTranslations('dashboard.leadsPage');
  const { formatDate, formatTime } = useFormatting();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const queryActive = hasActiveQuery(searchQuery);

  // Zero submissions ever (UC-041 A1) — distinct from a zero-match search/filter/date-range
  // result (A3, below): nothing to search yet, so the search panel doesn't render either.
  if (total === 0 && !queryActive) {
    return (
      <Card className="mx-auto max-w-md space-y-3 p-8 text-center">
        <p className="text-base font-bold text-gray-900">{t('emptyTitle')}</p>
        <p className="text-sm text-gray-500">{t('emptyBody')}</p>
        <Link
          href="/dashboard/hotsite"
          className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {t('emptyCta')}
        </Link>
      </Card>
    );
  }

  const isAdvancedMode = searchQuery.mode === 'advanced';

  // Carries the exact current list state (mode included) through to the detail page's own
  // "back" link (LeadFormSubmissionDetail), instead of it always returning to the bare,
  // unfiltered basic view (M20-S13 story feedback, 2026-08-27).
  const currentListQuery = buildLeadsSearchQuery({ ...searchQuery, page });
  const returnToParam = currentListQuery ? `?returnTo=${encodeURIComponent(currentListQuery)}` : '';

  return (
    <div className="space-y-4">
      {/* Keyed by the resolved query (page excluded, so paging alone never remounts this) —
          router.push is a soft navigation that keeps a client component mounted, so any
          navigation NOT routed through the panel's own handlers (e.g. the no-results card's
          plain "Limpar busca"/"Limpar filtros" Link below) would otherwise leave its local
          searchTerm/filterRows/range state stale even though the URL/list already moved on.
          Remounting on every real query change resets that state for free, for every
          navigation source uniformly, rather than chasing each one by hand (Codex PR #436
          round 3 finding, 2026-08-27 — found after the mode-toggle case of this same bug was
          already fixed by hand in round 2, missing this sibling case). */}
      <LeadFormSearchPanel
        key={buildLeadsSearchQuery(searchQuery)}
        initialMode={searchQuery.mode ?? 'basic'}
        initialSearch={searchQuery.search}
        initialFilters={searchQuery.filters}
        initialFrom={searchQuery.submittedFrom}
        initialTo={searchQuery.submittedTo}
        filterOptionLabels={filterOptionLabels}
      />

      {total === 0 ? (
        <Card className="mx-auto max-w-md space-y-3 p-8 text-center" data-testid="leads-no-results">
          <p className="text-base font-bold text-gray-900">
            {isAdvancedMode
              ? t('filtersNoResultsTitle')
              : searchQuery.search
                ? t('searchNoResultsTitleWithTerm', { term: searchQuery.search })
                : t('searchNoResultsTitleGeneric')}
          </p>
          <p className="text-sm text-gray-500">
            {isAdvancedMode ? t('filtersNoResultsBody') : t('searchNoResultsBody')}
          </p>
          <Link
            href="/dashboard/leads"
            className="inline-block rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {isAdvancedMode ? t('filtersNoResultsClear') : t('searchNoResultsClear')}
          </Link>
        </Card>
      ) : (
        <>
          <p className="text-sm text-gray-500" data-testid="leads-total-count">
            {t('totalCount', { count: total })}
          </p>

          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={`/dashboard/leads/${item.id}${returnToParam}`}
                  data-testid="lead-submission-row"
                  data-submission-id={item.id}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600"
                  >
                    {getInitials(item.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                    <p className="truncate text-sm text-gray-500">
                      {item.email} · {item.phone}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-gray-400">
                    {formatDate(new Date(item.submittedAt))},{' '}
                    {formatTime(new Date(item.submittedAt))}
                  </p>
                </Link>
              ))}
            </div>
          </Card>

          {totalPages > 1 && (
            <nav
              className="flex items-center justify-center gap-2"
              aria-label={t('paginationAriaLabel')}
            >
              <Link
                href={buildPageHref(searchQuery, page - 1)}
                aria-disabled={page <= 1}
                aria-label={t('previousPage')}
                className={
                  page <= 1
                    ? 'pointer-events-none rounded-md border px-3 py-1.5 text-sm opacity-40'
                    : 'rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50'
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
              {buildPageWindow(page, totalPages).map((entry) =>
                entry.type === 'ellipsis' ? (
                  <span key={entry.key} aria-hidden="true" className="px-1.5 text-sm text-gray-400">
                    …
                  </span>
                ) : (
                  <Link
                    key={entry.value}
                    href={buildPageHref(searchQuery, entry.value)}
                    aria-current={entry.value === page ? 'page' : undefined}
                    className={
                      entry.value === page
                        ? 'rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white'
                        : 'rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50'
                    }
                  >
                    {entry.value}
                  </Link>
                ),
              )}
              <Link
                href={buildPageHref(searchQuery, page + 1)}
                aria-disabled={page >= totalPages}
                aria-label={t('nextPage')}
                className={
                  page >= totalPages
                    ? 'pointer-events-none rounded-md border px-3 py-1.5 text-sm opacity-40'
                    : 'rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50'
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
