'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  buildLeadsSearchQuery,
  isSearchTermValid,
  toEditableFilterRows,
  type LeadFormEditableFilterRow,
  type LeadFormSearchFilterEntry,
  type LeadFormSearchMode,
} from '@/features/platform/model/lead-form-search';
import { LeadFormAdvancedFilters } from './LeadFormAdvancedFilters';
import { LeadFormDateRangeControl, type LeadFormDateRangeValue } from './LeadFormDateRangeControl';

export type { LeadFormSearchMode };

interface LeadFormSearchPanelProps {
  readonly initialMode: LeadFormSearchMode;
  readonly initialSearch?: string;
  readonly initialFilters?: readonly LeadFormSearchFilterEntry[];
  readonly initialFrom?: string;
  readonly initialTo?: string;
  readonly filterOptionLabels: readonly string[];
}

// Button-driven, not live/debounced (locked in at story-discovery, 2026-08-27): typing into the
// search box or picking a date range does nothing by itself — the search/filters and the shared
// date range are only applied on an explicit "Aplicar"/"Aplicar filtros" click. All navigation
// state (search/filters/date range/page) lives in the URL — this component only ever pushes a
// new `/dashboard/leads` query string; the server-rendered list re-fetches from it.
export function LeadFormSearchPanel({
  initialMode,
  initialSearch,
  initialFilters,
  initialFrom,
  initialTo,
  filterOptionLabels,
}: LeadFormSearchPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.leadsPage');
  const router = useRouter();
  const [mode, setMode] = useState<LeadFormSearchMode>(initialMode);
  const [searchTerm, setSearchTerm] = useState(initialSearch ?? '');
  const [filterRows, setFilterRows] = useState<LeadFormEditableFilterRow[]>(() =>
    toEditableFilterRows(initialFilters),
  );
  const [range, setRange] = useState<LeadFormDateRangeValue>({ from: initialFrom, to: initialTo });

  function navigate(next: {
    mode: LeadFormSearchMode;
    search?: string;
    filters?: readonly LeadFormSearchFilterEntry[];
  }): void {
    router.push(
      `/dashboard/leads${buildLeadsSearchQuery({
        ...next,
        submittedFrom: range.from,
        submittedTo: range.to,
      })}`,
    );
  }

  function handleApplyBasic(): void {
    navigate({
      mode: 'basic',
      search: isSearchTermValid(searchTerm) ? searchTerm.trim() : undefined,
    });
  }

  function handleClearBasic(): void {
    setSearchTerm('');
    setRange({});
    router.push('/dashboard/leads');
  }

  const activeFilterRows = filterRows.filter(
    (row) => row.questionLabel && isSearchTermValid(row.value),
  );
  // A row with only one side filled in (a question picked but no value typed, or a value typed
  // but no question picked) is ambiguous — silently dropping it from activeFilterRows above
  // with no feedback would apply a filter set the manager didn't intend, with no explanation why
  // the result doesn't match what they typed (Codex PR #436 round 1 finding, 2026-08-27). A row
  // with neither side filled in is fine (simply not yet started).
  const hasIncompleteRow = filterRows.some(
    (row) => Boolean(row.questionLabel) !== isSearchTermValid(row.value),
  );

  function handleApplyAdvanced(): void {
    navigate({
      mode: 'advanced',
      filters:
        activeFilterRows.length > 0
          ? // .trim() matches handleApplyBasic's own searchTerm.trim() — sending an untrimmed
            // value (e.g. "  casado  ") would search for that literal padded string instead of
            // the trimmed one isSearchTermValid validated (CodeRabbit PR #436 round 1 finding,
            // 2026-08-27).
            activeFilterRows.map(({ questionLabel, value }) => ({
              questionLabel,
              value: value.trim(),
            }))
          : undefined,
    });
  }

  // Stays in advanced mode (`mode=advanced` written explicitly, since clearing `filterRows`
  // means the URL carries no `filters` for resolveSearchMode() to infer advanced from) — clearing
  // the active filters is not the same action as leaving advanced mode altogether, which is what
  // the mode toggle button below is for (Codex PR #436 round 4 finding, 2026-08-27: this used to
  // hard-navigate to the bare `/dashboard/leads` basic-mode URL, silently switching modes as a
  // side effect of clearing).
  function handleClearAdvanced(): void {
    setFilterRows(toEditableFilterRows(undefined));
    setRange({});
    router.push(`/dashboard/leads${buildLeadsSearchQuery({ mode: 'advanced' })}`);
  }

  // Switching modes always drops the other mode's active query (never sends both `search` and
  // `filters`), but keeps the shared date range — matches S12's mutually-exclusive backend
  // contract. Harmless to navigate even when the other mode had nothing applied yet.
  //
  // Also resets both modes' own local state (searchTerm/filterRows), not just the URL — router.push
  // is a soft App Router navigation that keeps this client component mounted, so its useState
  // would otherwise still hold the stale value after the URL/list have already moved on (Codex
  // PR #436 round 1 finding, 2026-08-27: re-entering basic mode after applying a search and
  // switching away left the search box still showing the old term, even though nothing was
  // actually applied anymore).
  //
  // The pushed URL always carries the NEW mode explicitly (via buildLeadsSearchQuery's own
  // `mode` param) rather than relying on `filters` presence to imply it — switching to advanced
  // with no filter rows active yet (the common case: the panel just opened) used to drop straight
  // back to a bare, filters-less URL that resolveSearchMode() would read as basic once
  // LeadFormSubmissionsList's key-based remount re-initialized this component from the server
  // (Codex PR #436 round 4 finding, 2026-08-27 — the CI failure this predicted actually
  // reproduced live in leads-search.spec.ts).
  function toggleMode(): void {
    const nextMode: LeadFormSearchMode = mode === 'basic' ? 'advanced' : 'basic';
    setMode(nextMode);
    setSearchTerm('');
    setFilterRows(toEditableFilterRows(undefined));
    router.push(
      `/dashboard/leads${buildLeadsSearchQuery({
        mode: nextMode,
        submittedFrom: range.from,
        submittedTo: range.to,
      })}`,
    );
  }

  return (
    <div
      className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4"
      data-testid="leads-search-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-gray-900">
          {mode === 'basic' ? t('searchTitle') : t('advancedFiltersTitle')}
        </h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={toggleMode}
          data-testid="leads-mode-toggle"
        >
          {mode === 'basic' ? t('advancedFiltersToggleOn') : t('advancedFiltersToggleOff')}
        </Button>
      </div>

      {mode === 'basic' ? (
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              data-testid="leads-search-input"
              className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <p className="text-xs text-gray-400">{t('basicModeHint')}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500">{t('advancedFiltersHint')}</p>
          <LeadFormAdvancedFilters
            rows={filterRows}
            filterOptionLabels={filterOptionLabels}
            onChange={setFilterRows}
            questionPlaceholder={t('advancedFiltersQuestionPlaceholder')}
            valuePlaceholder={t('advancedFiltersValuePlaceholder')}
            removeRowLabel={t('advancedFiltersRemoveRow')}
            addRowLabel={t('advancedFiltersAddRow')}
            andLabel={t('advancedFiltersAndLabel')}
          />
          <p className="text-xs text-gray-400">{t('advancedFiltersMaxHint')}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <LeadFormDateRangeControl
          value={range}
          onChange={setRange}
          placeholder={t('dateRangePlaceholder')}
        />
        {mode === 'basic' ? (
          <>
            <Button type="button" onClick={handleApplyBasic} data-testid="leads-search-apply">
              {t('searchApply')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleClearBasic}
              data-testid="leads-search-clear"
            >
              {t('searchClear')}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              onClick={handleApplyAdvanced}
              disabled={hasIncompleteRow}
              data-testid="leads-filters-apply"
            >
              {t('advancedFiltersApply')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleClearAdvanced}
              data-testid="leads-filters-clear"
            >
              {t('advancedFiltersClear')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
