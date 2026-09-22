'use client';

import { useState } from 'react';
import type { ScheduleClosure, ScheduleOpening } from '@ikaro/types';
import { useCloseOnOutsideInteraction } from '@/features/booking/hooks/useCloseOnOutsideInteraction';

// Extracted from useScheduleUiState below — the closure/opening sheet open-flags, the closure
// warning banner, and the two removal-confirmation targets are a cohesive unit, independent of
// the week/date selection and the filter popovers around them.
function useScheduleSheetState() {
  const [closureSheetOpen, setClosureSheetOpen] = useState(false);
  const [openingSheetOpen, setOpeningSheetOpen] = useState(false);
  const [closureWarning, setClosureWarning] = useState<string | null>(null);
  const [removeClosureTarget, setRemoveClosureTarget] = useState<ScheduleClosure | null>(null);
  const [removeOpeningTarget, setRemoveOpeningTarget] = useState<ScheduleOpening | null>(null);

  return {
    closureSheetOpen,
    setClosureSheetOpen,
    openingSheetOpen,
    setOpeningSheetOpen,
    closureWarning,
    setClosureWarning,
    removeClosureTarget,
    setRemoveClosureTarget,
    removeOpeningTarget,
    setRemoveOpeningTarget,
  };
}

// Extracted from useScheduleUiState below — the status-filter and resource-filter floating
// popovers share the identical open-flag + outside-click-close shape.
function useScheduleFilterPopoverState() {
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const statusFilterRef = useCloseOnOutsideInteraction<HTMLDivElement>(
    statusFilterOpen,
    setStatusFilterOpen,
  );
  const [resourceFilterOpen, setResourceFilterOpen] = useState(false);
  const resourceFilterRef = useCloseOnOutsideInteraction<HTMLDivElement>(
    resourceFilterOpen,
    setResourceFilterOpen,
  );

  return {
    statusFilterOpen,
    setStatusFilterOpen,
    statusFilterRef,
    resourceFilterOpen,
    setResourceFilterOpen,
    resourceFilterRef,
  };
}

// Extracted from SchedulePage (TD37-S5A) — the page's local interactive UI state (selected
// week/date, sheet/dialog open flags, the status/resource filter popovers) is a cohesive unit,
// independent of the week's server data and the derived timeline computed from it.
export function useScheduleUiState(
  todayKey: string,
  initialWeekStartKey: string,
  initialSelectedDateKey?: string,
) {
  const [weekStartKey, setWeekStartKey] = useState(initialWeekStartKey);
  const [selectedDateKey, setSelectedDateKey] = useState(initialSelectedDateKey ?? todayKey);
  const sheets = useScheduleSheetState();
  const filterPopovers = useScheduleFilterPopoverState();

  return {
    weekStartKey,
    setWeekStartKey,
    selectedDateKey,
    setSelectedDateKey,
    ...sheets,
    ...filterPopovers,
  };
}

export type ScheduleUiState = ReturnType<typeof useScheduleUiState>;

export function resetInteractiveState(ui: ScheduleUiState): void {
  ui.setClosureWarning(null);
  ui.setClosureSheetOpen(false);
  ui.setOpeningSheetOpen(false);
  ui.setStatusFilterOpen(false);
  ui.setResourceFilterOpen(false);
}

export function syncWeekAndDate(ui: ScheduleUiState, weekKey: string, dateKey: string): void {
  ui.setWeekStartKey(weekKey);
  ui.setSelectedDateKey(dateKey);
  resetInteractiveState(ui);
}
