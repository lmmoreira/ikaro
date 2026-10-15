'use client';

import { useMemo, useState, type RefObject } from 'react';
import { useCloseOnOutsideInteraction } from '@/features/booking/hooks/useCloseOnOutsideInteraction';
import {
  AGENDA_FILTER_OPTIONS,
  useAgendaPreferences,
  type AgendaFilterOption,
} from '@/features/booking/schedule/agenda-preferences';

interface AgendaFilter {
  readonly hiddenOptions: ReadonlySet<AgendaFilterOption>;
  readonly isVisible: (option: AgendaFilterOption) => boolean;
  /** Every block hidden: the Agenda shows its own empty state with "Limpar filtro". */
  readonly allHidden: boolean;
  readonly toggleOption: (option: AgendaFilterOption) => void;
  readonly reset: () => void;
  readonly menuOpen: boolean;
  readonly toggleMenu: () => void;
  readonly closeMenu: () => void;
  readonly menuRef: RefObject<HTMLDivElement | null>;
}

// The state behind the Agenda's "Filtrar agenda" balloon: which blocks are hidden (persisted per
// tenant) and whether the popover is open (closed by a click outside or Escape, like Horários').
export function useAgendaFilter(): AgendaFilter {
  const { hiddenOptions, setHiddenOptions } = useAgendaPreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useCloseOnOutsideInteraction<HTMLDivElement>(menuOpen, setMenuOpen);
  const hiddenSet = useMemo(() => new Set(hiddenOptions), [hiddenOptions]);

  return {
    hiddenOptions: hiddenSet,
    isVisible: (option) => !hiddenSet.has(option),
    allHidden: hiddenSet.size === AGENDA_FILTER_OPTIONS.length,
    toggleOption: (option) =>
      setHiddenOptions((current) =>
        current.includes(option) ? current.filter((o) => o !== option) : [...current, option],
      ),
    reset: () => setHiddenOptions([]),
    menuOpen,
    toggleMenu: () => setMenuOpen((open) => !open),
    closeMenu: () => setMenuOpen(false),
    menuRef,
  };
}
