'use client';

import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
import type { BookingStatus } from '@ikaro/types';
import { ChevronDown, Filter } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/utils/cn';
import { SCHEDULE_BOOKING_STATUS_OPTIONS } from '@/features/booking/model/booking-status';

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

// Extracted from SchedulePage (TD37-S5A) — the floating status-filter trigger + popover menu is a
// self-contained UI concern, unrelated to the timeline/week-view rendering around it.
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
    <div
      ref={containerRef}
      className="fixed bottom-24 right-4 z-30 w-fit max-w-[calc(100vw-2rem)] lg:bottom-6 lg:right-6"
    >
      <Button
        type="button"
        aria-label={t('statusFilterTrigger')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggleOpen}
        className="h-auto w-fit justify-between rounded-full border border-blue-500/20 bg-blue-600 px-3 py-2.5 text-left text-white shadow-lg hover:bg-blue-600/90"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Filter className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-semibold leading-tight">
            {t('statusFilterTrigger')}
          </span>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </Button>

      {open ? (
        <div className="absolute bottom-full right-0 mb-3 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">{t('statusFilterMenuTitle')}</p>
            <p className="mt-1 text-xs text-gray-500">{t('statusFilterMenuDescription')}</p>
          </div>
          <div className="max-h-72 overflow-y-auto border-y border-gray-100 px-2 py-2">
            {SCHEDULE_BOOKING_STATUS_OPTIONS.map((status) => (
              <label
                key={status}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedStatusSet.has(status)}
                  onChange={() => onToggleStatus(status)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="min-w-0 flex-1 text-sm font-medium text-gray-900">
                  {statusLabels[status]}
                </span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={onReset}>
              {t('statusFilterReset')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t('statusFilterDone')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
