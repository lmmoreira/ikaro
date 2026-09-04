'use client';

import { useState } from 'react';
import type { ScheduleClosure, ScheduleOpening } from '@ikaro/types';
import { useCloseOnOutsideInteraction } from '@/features/booking/hooks/useCloseOnOutsideInteraction';

// Extracted from SchedulePage (TD37-S5A) — the page's local interactive UI state (selected
// week/date, sheet/dialog open flags, the status-filter popover) is a cohesive unit, independent
// of the week's server data and the derived timeline computed from it.
export function useScheduleUiState(
  todayKey: string,
  initialWeekStartKey: string,
  initialSelectedDateKey?: string,
) {
  const [weekStartKey, setWeekStartKey] = useState(initialWeekStartKey);
  const [selectedDateKey, setSelectedDateKey] = useState(initialSelectedDateKey ?? todayKey);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [closureSheetOpen, setClosureSheetOpen] = useState(false);
  const [openingSheetOpen, setOpeningSheetOpen] = useState(false);
  const [closureWarning, setClosureWarning] = useState<string | null>(null);
  const [removeClosureTarget, setRemoveClosureTarget] = useState<ScheduleClosure | null>(null);
  const [removeOpeningTarget, setRemoveOpeningTarget] = useState<ScheduleOpening | null>(null);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const statusFilterRef = useCloseOnOutsideInteraction<HTMLDivElement>(
    statusFilterOpen,
    setStatusFilterOpen,
  );

  return {
    weekStartKey,
    setWeekStartKey,
    selectedDateKey,
    setSelectedDateKey,
    selectedResourceId,
    setSelectedResourceId,
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
    statusFilterOpen,
    setStatusFilterOpen,
    statusFilterRef,
  };
}

export type ScheduleUiState = ReturnType<typeof useScheduleUiState>;

export function resetInteractiveState(ui: ScheduleUiState): void {
  ui.setClosureWarning(null);
  ui.setClosureSheetOpen(false);
  ui.setOpeningSheetOpen(false);
  ui.setStatusFilterOpen(false);
}

export function syncWeekAndDate(ui: ScheduleUiState, weekKey: string, dateKey: string): void {
  ui.setWeekStartKey(weekKey);
  ui.setSelectedDateKey(dateKey);
  resetInteractiveState(ui);
}
