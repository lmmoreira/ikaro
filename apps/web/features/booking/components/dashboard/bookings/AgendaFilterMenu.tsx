'use client';

import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
import type { AgendaFilterOption } from '@/features/booking/schedule/agenda-preferences';
import { FilterCheckboxOption } from '../FilterCheckboxOption';
import { FloatingFilterMenu } from '../FloatingFilterMenu';

export type AgendaFilterCounts = Readonly<Record<AgendaFilterOption, number>>;

interface AgendaFilterMenuProps {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly open: boolean;
  readonly onToggleOpen: () => void;
  readonly hiddenOptions: ReadonlySet<AgendaFilterOption>;
  readonly counts: AgendaFilterCounts;
  readonly onToggleOption: (option: AgendaFilterOption) => void;
  readonly onReset: () => void;
  readonly onClose: () => void;
}

const GROUPS: readonly {
  readonly labelKey: 'filterGroupActionNeeded' | 'filterGroupConfirmed';
  readonly options: readonly {
    readonly option: AgendaFilterOption;
    readonly labelKey:
      | 'filterOptionBookings'
      | 'filterOptionRecurrences'
      | 'filterOptionToday'
      | 'filterOptionUpcoming';
  }[];
}[] = [
  {
    labelKey: 'filterGroupActionNeeded',
    options: [
      { option: 'bookings', labelKey: 'filterOptionBookings' },
      { option: 'recurrences', labelKey: 'filterOptionRecurrences' },
    ],
  },
  {
    labelKey: 'filterGroupConfirmed',
    options: [
      { option: 'today', labelKey: 'filterOptionToday' },
      { option: 'upcoming', labelKey: 'filterOptionUpcoming' },
    ],
  },
];

// "Filtrar agenda" (M23-S13): shows or hides the four blocks of the Agenda — Agendamentos and
// Recorrências inside "Precisa de ação", then Hoje and Próximos dias. Only the body is its own; the
// trigger, popover and footer are the shared FloatingFilterMenu that Horários' filters use too.
export function AgendaFilterMenu({
  containerRef,
  open,
  onToggleOpen,
  hiddenOptions,
  counts,
  onToggleOption,
  onReset,
  onClose,
}: AgendaFilterMenuProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingQueue');

  return (
    <FloatingFilterMenu
      containerRef={containerRef}
      open={open}
      onToggleOpen={onToggleOpen}
      onReset={onReset}
      onClose={onClose}
      triggerLabel={t('filterTrigger')}
      title={t('filterMenuTitle')}
      description={t('filterMenuDescription')}
      resetLabel={t('filterReset')}
      doneLabel={t('filterDone')}
      hiddenCount={hiddenOptions.size}
      hiddenCountLabel={t('filterHiddenCount', { count: hiddenOptions.size })}
    >
      <div className="max-h-80 overflow-y-auto border-y border-gray-100 px-2 py-2">
        {GROUPS.map((group) => (
          <div key={group.labelKey}>
            <p className="px-2 pb-1 pt-2 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
              {t(group.labelKey)}
            </p>
            {group.options.map(({ option, labelKey }) => (
              <FilterCheckboxOption
                key={option}
                label={t(labelKey)}
                checked={!hiddenOptions.has(option)}
                count={counts[option]}
                onChange={() => onToggleOption(option)}
              />
            ))}
          </div>
        ))}
      </div>
    </FloatingFilterMenu>
  );
}
