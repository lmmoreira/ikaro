'use client';

import { useEffect, useMemo } from 'react';
import type { BookingStatus, StaffBookingCardResponse } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import {
  type ScheduleViewMode,
  useSchedulePreferences,
} from '@/features/booking/schedule/schedule-preferences';
import { useMediaQuery } from '@/features/booking/hooks/useMediaQuery';
import { useSelectableResources } from '@/features/booking/schedule/useSelectableResources';
import { useTenant } from '@/providers/tenant-provider';
import {
  useScheduleUiState,
  type ScheduleUiState,
} from '@/features/booking/schedule/schedule-page-ui-state';
import { useScheduleQueryData } from '@/features/booking/schedule/schedule-page-query-data';
import { useScheduleTimelineDerived } from '@/features/booking/schedule/schedule-page-timeline-derived';
import type { SchedulePageControllerInput } from '@/features/booking/schedule/schedule-page-controller-types';
import { RESOURCE_FILTER_MAX_SELECTED } from '@/features/booking/schedule/schedule-page-interaction-handlers';

// Drops any id no longer active, then truncates to the cap (TD44 Story 0) — covers a selection
// persisted before the cap existed (or one grown past it in another browser tab), keeping first-N
// by persisted order rather than leaving a stale, larger-than-6 set silently in effect.
function reconcileResourceIds(
  selectedResourceIds: readonly string[],
  activeResourceIds: ReadonlySet<string>,
): readonly string[] {
  return selectedResourceIds
    .filter((id) => activeResourceIds.has(id))
    .slice(0, RESOURCE_FILTER_MAX_SELECTED);
}

const EMPTY_RESOURCE_IDS: readonly string[] = [];

interface ReconciledResourceIdsResult {
  readonly selectedResourceIds: readonly string[];
  // The same MANAGER-only fetch backing the reconciliation below, exposed so callers needing a
  // resourceId -> name lookup (timeline block labels, removal dialogs) don't issue a second,
  // redundant fetch for the same data.
  readonly resourceNameById: ReadonlyMap<string, string>;
}

// Extracted from useScheduleVisibleData below — drops any persisted selected-resource id no
// longer present in the tenant's active resource list (e.g. deactivated after being selected).
// Without this, ResourceFilterMenu's checkbox list simply stops rendering that id (it only shows
// active resources) while useSchedule.ts keeps silently querying it forever — a stale id the user
// has no way to uncheck since its row no longer exists to uncheck. MANAGER-only: the endpoint
// behind useSelectableResources is MANAGER-gated (apps/bff/src/features/booking/
// resource.controller.ts), so skip the fetch entirely for STAFF rather than hit a 403 on every
// schedule page load.
function useReconciledSelectedResourceIds(
  selectedResourceIds: readonly string[],
  setSelectedResourceIds: (next: readonly string[]) => void,
): ReconciledResourceIdsResult {
  const { role } = useTenant();
  const isManager = role === 'MANAGER';
  const { resources, isLoading, isError } = useSelectableResources(isManager);
  const activeResourceIds = useMemo(() => new Set(resources.map((r) => r.id)), [resources]);
  const resourceNameById = useMemo(
    () => new Map(resources.map((resource) => [resource.id, resource.name])),
    [resources],
  );
  // Still loading or the fetch errored: pass through untouched rather than reconciling against a
  // transiently-empty active set. Without the isError guard, a network blip on page load would
  // resolve `resources` to [] (same shape as a genuinely-empty tenant), reconcile every real
  // selection down to [], and persist that deletion — silently reverting the user's filter to
  // tenant-wide and destroying their selection over a transient failure, not an actual
  // deactivation.
  const canReconcile = isManager && !isLoading && !isError;
  const reconciled = useMemo(
    () =>
      canReconcile
        ? reconcileResourceIds(selectedResourceIds, activeResourceIds)
        : selectedResourceIds,
    [canReconcile, selectedResourceIds, activeResourceIds],
  );

  useEffect(() => {
    if (!canReconcile || reconciled.length === selectedResourceIds.length) return;
    setSelectedResourceIds(reconciled);
  }, [canReconcile, reconciled, selectedResourceIds, setSelectedResourceIds]);

  // Non-MANAGER must never have resourceIds affect query/filter behavior, no matter what's
  // persisted — e.g. a value left over from when this browser last acted as MANAGER, or a
  // different staff member's session on a shared device. STAFF has no UI to view or clear this
  // preference, so the persisted value itself is left untouched here; only the *effective* value
  // used downstream (query fan-out, filter set) is forced empty.
  //
  // Capped again here, independently of `canReconcile`/`reconciled` above (TD44 follow-up,
  // round 2): `reconciled` deliberately stays unsliced and unpersisted on a loading/error fetch —
  // that's the isError guard's whole point, to not destructively overwrite a real persisted
  // selection over a transient failure. But the *effective* (rendered/queried) value must never
  // exceed the cap regardless of why the resource-list fetch didn't run — a legacy 7+ selection
  // must not render 7+ columns just because this specific page load's fetch happened to error.
  const effectiveSelectedResourceIds = isManager
    ? reconciled.slice(0, RESOURCE_FILTER_MAX_SELECTED)
    : EMPTY_RESOURCE_IDS;

  return { selectedResourceIds: effectiveSelectedResourceIds, resourceNameById };
}

// Extracted from useScheduleVisibleData below — the status/resource Set derivation and the
// status-filtered booking list are a cohesive, self-contained computation, independent of the
// week's server data fetch and the view-mode resolution around it.
function useScheduleFilterSets(
  selectedStatuses: readonly BookingStatus[],
  selectedResourceIds: readonly string[],
  bookingsItems: readonly StaffBookingCardResponse[],
) {
  const selectedStatusSet = useMemo(() => new Set(selectedStatuses), [selectedStatuses]);
  const selectedResourceIdSet = useMemo(() => new Set(selectedResourceIds), [selectedResourceIds]);
  const visibleBookings = useMemo(
    () => bookingsItems.filter((booking) => selectedStatusSet.has(booking.status)),
    [bookingsItems, selectedStatusSet],
  );

  return { selectedStatusSet, selectedResourceIdSet, visibleBookings };
}

// Extracted from useScheduleVisibleData below — the week's server data fetch (closures/openings/
// bookings) is a self-contained concern, independent of the status/resource filter derivation and
// the view-mode resolution around it.
function useScheduleWeekData(
  props: SchedulePageControllerInput,
  ui: ScheduleUiState,
  selectedResourceIds: readonly string[],
) {
  const {
    initialClosures,
    initialOpenings,
    initialBookings,
    weekStartKey: initialWeekStartKey,
  } = props;

  return useScheduleQueryData(
    ui.weekStartKey,
    initialWeekStartKey,
    initialClosures,
    initialOpenings,
    initialBookings,
    selectedResourceIds,
  );
}

// Extracted from useScheduleVisibleData below — resolving the effective view mode (persisted
// preference, else desktop/mobile default) is a self-contained computation.
function useResolvedScheduleViewMode(viewMode: ScheduleViewMode | null): ScheduleViewMode {
  const isDesktopSchedule = useMediaQuery('(min-width: 1024px)');
  return viewMode ?? (isDesktopSchedule ? 'week' : 'day');
}

function useScheduleVisibleData(props: SchedulePageControllerInput, ui: ScheduleUiState) {
  const {
    selectedStatuses,
    setSelectedStatuses,
    viewMode,
    setViewMode,
    selectedResourceIds: persistedSelectedResourceIds,
    setSelectedResourceIds,
  } = useSchedulePreferences();
  const { selectedResourceIds, resourceNameById } = useReconciledSelectedResourceIds(
    persistedSelectedResourceIds,
    setSelectedResourceIds,
  );

  const { weekDates, visibleClosures, visibleOpenings, bookingsItems, scheduleFetchError } =
    useScheduleWeekData(props, ui, selectedResourceIds);
  const { selectedStatusSet, selectedResourceIdSet, visibleBookings } = useScheduleFilterSets(
    selectedStatuses,
    selectedResourceIds,
    bookingsItems,
  );
  const scheduleViewMode = useResolvedScheduleViewMode(viewMode);

  return {
    weekDates,
    visibleClosures,
    visibleOpenings,
    visibleBookings,
    bookingsItems,
    selectedStatusSet,
    setSelectedStatuses,
    selectedResourceIdSet,
    setSelectedResourceIds,
    setPersistedViewMode: setViewMode,
    scheduleViewMode,
    scheduleFetchError,
    resourceNameById,
  };
}

// Extracted from SchedulePage (TD37-S5A) — composes the page's UI state, the week's server data
// (filtered by the selected status set), and the derived per-day timeline into one object; the
// single seam the top-level controller (useSchedulePageController) builds labels/handlers on top of.
export function useScheduleCoreData(props: SchedulePageControllerInput) {
  const {
    businessHours,
    todayKey,
    weekStartKey: initialWeekStartKey,
    initialSelectedDateKey,
    slotGranularityMinutes,
  } = props;

  const { formatDateLong, timezone } = useFormatting();
  const ui = useScheduleUiState(todayKey, initialWeekStartKey, initialSelectedDateKey);
  const visible = useScheduleVisibleData(props, ui);

  const timelineDerived = useScheduleTimelineDerived({
    weekDates: visible.weekDates,
    visibleClosures: visible.visibleClosures,
    visibleOpenings: visible.visibleOpenings,
    visibleBookings: visible.visibleBookings,
    businessHours,
    timezone,
    slotGranularityMinutes,
    selectedDateKey: ui.selectedDateKey,
    resourceNameById: visible.resourceNameById,
  });

  return {
    ui,
    timezone,
    formatDateLong,
    ...visible,
    ...timelineDerived,
  };
}

export type ScheduleCoreData = ReturnType<typeof useScheduleCoreData>;
