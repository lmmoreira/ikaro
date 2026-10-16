'use client';

import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
import type { BookingStatus } from '@ikaro/types';
import { SCHEDULE_BOOKING_STATUS_OPTIONS } from '@/features/booking/model/booking-status';
import { FilterCheckboxOption } from '../FilterCheckboxOption';
import { FloatingFilterMenu } from '../FloatingFilterMenu';

interface ScheduleStatusFilterMenuProps {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly open: boolean;
  readonly onToggleOpen: () => void;
  readonly selectedStatusSet: ReadonlySet<BookingStatus>;
  readonly statusLabels: Record<BookingStatus, string>;
  readonly onToggleStatus: (status: BookingStatus) => void;
  readonly onReset: () => void;
  readonly onClose: () => void;
}

// Extracted from SchedulePage (TD37-S5A) — the status-filter body; the floating trigger and
// popover shell is the shared FloatingFilterMenu (M23-S13).
export function ScheduleStatusFilterMenu({
  containerRef,
  open,
  onToggleOpen,
  selectedStatusSet,
  statusLabels,
  onToggleStatus,
  onReset,
  onClose,
}: ScheduleStatusFilterMenuProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedule');

  return (
    <FloatingFilterMenu
      containerRef={containerRef}
      open={open}
      onToggleOpen={onToggleOpen}
      onReset={onReset}
      onClose={onClose}
      triggerLabel={t('statusFilterTrigger')}
      title={t('statusFilterMenuTitle')}
      description={t('statusFilterMenuDescription')}
      resetLabel={t('statusFilterReset')}
      doneLabel={t('statusFilterDone')}
    >
      <div className="max-h-72 overflow-y-auto border-y border-gray-100 px-2 py-2">
        {SCHEDULE_BOOKING_STATUS_OPTIONS.map((status) => (
          <FilterCheckboxOption
            key={status}
            label={statusLabels[status]}
            checked={selectedStatusSet.has(status)}
            onChange={() => onToggleStatus(status)}
          />
        ))}
      </div>
    </FloatingFilterMenu>
  );
}
