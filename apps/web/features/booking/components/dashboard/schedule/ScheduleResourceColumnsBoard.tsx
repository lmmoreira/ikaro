'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type {
  BookingStatus,
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { useScheduleDayGrid } from '@/features/booking/schedule/useSchedule';
import { buildSlotLabels } from '@/features/booking/schedule/schedule-page-derived';
import { buildResourceColumns } from '@/features/booking/schedule/schedule-resource-columns';
import { getLocalTimeKey, timeToMinutes } from '@/features/booking/schedule/date-utils';
import {
  resolveNowMarkerTopPx,
  useScrollToNowOnce,
} from '@/features/booking/schedule/schedule-scroll-to-now';
import type { ScheduleTimelineRenderProps } from './ScheduleTimelineEventRenderer';
import { ScheduleTimelineBoard } from './ScheduleTimelineBoard';

interface ScheduleResourceColumnsBoardProps extends ScheduleTimelineRenderProps {
  readonly selectedResourceIdSet: ReadonlySet<string>;
  readonly resourceNameById: ReadonlyMap<string, string>;
  // The full, status-unfiltered week bookings list — NOT visibleBookings. See
  // schedule-resource-columns.ts's resolveResourceBookings for why the status filter must be
  // re-applied per matched booking here rather than upstream.
  readonly bookings: readonly StaffBookingCardResponse[];
  readonly selectedStatusSet: ReadonlySet<BookingStatus>;
  readonly closures: readonly ScheduleClosure[];
  readonly openings: readonly ScheduleOpening[];
  readonly selectedDateKey: string;
  readonly todayKey: string;
  readonly businessHours: TenantBusinessHours;
}

// A day whose data hasn't arrived yet must not look identical to a day genuinely empty of
// bookings — the columns board renders its own loading state before the empty-but-valid grid
// ScheduleTimelineBoard already draws for zero events.
function ColumnsFeedback({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-[14rem] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 text-center text-sm text-gray-500">
      {children}
    </div>
  );
}

// Renders one unmodified ScheduleTimelineBoard per checked resource, side by side — the manager's
// bounded curation (ResourceFilterMenu) drives which columns exist, not "every active resource".
// See docs/M22-MULTIVERTICAL-SERVICE-AVAILABILITY.md's M22-S06 entry for the full design.
export function ScheduleResourceColumnsBoard(
  props: ScheduleResourceColumnsBoardProps,
): React.JSX.Element {
  const t = useTranslations('dashboard.schedule');
  const commonT = useTranslations('common');
  const locale = useResolvedLocale();
  const {
    selectedResourceIdSet,
    resourceNameById,
    bookings,
    selectedStatusSet,
    closures,
    openings,
    selectedDateKey,
    todayKey,
    businessHours,
    ...timelineProps
  } = props;

  // TD44 Story 4 — scroll-to-now, anchored to only the first rendered column. Each column can have
  // its own independently-resolved active window (a per-resource exceptional opening), so aligning
  // every column's "now" position at once isn't possible until TD44 Story 3 (shared hour axis)
  // ships — anchoring to one column still gets the page scrolled to a reasonable position today.
  const isToday = selectedDateKey === todayKey;
  const nowMarkerRef = useScrollToNowOnce(isToday, selectedDateKey);
  // Reads props.timezone directly (not timelineProps.timezone) — touching the ...rest object
  // outside the columns useMemo below broke the React Compiler's ability to verify that memo's own
  // dependency array stays stable.
  const nowMinutes = timeToMinutes(getLocalTimeKey(new Date(), props.timezone));

  const resourceIds = useMemo(() => [...selectedResourceIdSet], [selectedResourceIdSet]);
  const dayGrid = useScheduleDayGrid(selectedDateKey, resourceIds);

  const columns = useMemo(
    () =>
      dayGrid.data
        ? buildResourceColumns({
            selectedResourceIds: selectedResourceIdSet,
            resourceNameById,
            dayGridColumns: dayGrid.data.columns,
            bookings,
            selectedStatusSet,
            closures,
            openings,
            selectedDateKey,
            timezone: timelineProps.timezone,
            slotGranularityMinutes: timelineProps.slotGranularityMinutes,
            businessHours,
            placeholderBookingLabel: t('dayGridPlaceholderBooking'),
          })
        : [],
    [
      dayGrid.data,
      selectedResourceIdSet,
      resourceNameById,
      bookings,
      selectedStatusSet,
      closures,
      openings,
      selectedDateKey,
      timelineProps.timezone,
      timelineProps.slotGranularityMinutes,
      businessHours,
      t,
    ],
  );

  if (dayGrid.isError) {
    // Same inline error-banner pattern as SchedulePage's own scheduleFetchError, per M22-S06's AC.
    return (
      <p
        data-testid="day-grid-fetch-error"
        className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
      >
        {t('dayGridFetchError')}: {resolveErrorMessageFromApiError(dayGrid.error, locale)}
      </p>
    );
  }

  if (dayGrid.isLoading) {
    return <ColumnsFeedback>{commonT('loading')}</ColumnsFeedback>;
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2" data-testid="schedule-resource-columns-board">
      {columns.map((column, index) => {
        const isFirstColumn = index === 0;
        return (
          <div
            key={column.resourceId}
            className="min-w-[16rem] flex-1"
            data-testid="schedule-resource-column"
          >
            <p className="mb-2 truncate text-sm font-semibold text-gray-900">
              {column.resourceName}
            </p>
            {column.timeline.events.length === 0 && !column.timeline.selectedDayClosed ? (
              <p className="mb-2 text-xs text-gray-400">{t('dayGridEmptyColumn')}</p>
            ) : null}
            <ScheduleTimelineBoard
              timeline={column.timeline}
              compact={false}
              slotLabels={buildSlotLabels(
                column.timeline.slotCount,
                column.timeline.timelineStartMinutes,
                timelineProps.slotGranularityMinutes,
              )}
              {...timelineProps}
              nowMarkerRef={isFirstColumn && isToday ? nowMarkerRef : undefined}
              nowMarkerTopPx={
                isFirstColumn && isToday
                  ? resolveNowMarkerTopPx(
                      column.timeline,
                      timelineProps.slotGranularityMinutes,
                      nowMinutes,
                    )
                  : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}
