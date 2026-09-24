'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type {
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
import type { ScheduleTimelineRenderProps } from './ScheduleTimelineEventRenderer';
import { ScheduleTimelineBoard } from './ScheduleTimelineBoard';

interface ScheduleResourceColumnsBoardProps extends ScheduleTimelineRenderProps {
  readonly selectedResourceIdSet: ReadonlySet<string>;
  readonly resourceNameById: ReadonlyMap<string, string>;
  readonly bookings: readonly StaffBookingCardResponse[];
  readonly closures: readonly ScheduleClosure[];
  readonly openings: readonly ScheduleOpening[];
  readonly selectedDateKey: string;
  readonly businessHours: TenantBusinessHours;
}

// A day whose data hasn't arrived yet must not look identical to a day genuinely empty of
// bookings — the columns board renders its own loading/error state before the empty-but-valid
// grid ScheduleTimelineBoard already draws for zero events.
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
    closures,
    openings,
    selectedDateKey,
    businessHours,
    ...timelineProps
  } = props;

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
    return (
      <ColumnsFeedback>
        {t('dayGridFetchError')}: {resolveErrorMessageFromApiError(dayGrid.error, locale)}
      </ColumnsFeedback>
    );
  }

  if (dayGrid.isLoading) {
    return <ColumnsFeedback>{commonT('loading')}</ColumnsFeedback>;
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2" data-testid="schedule-resource-columns-board">
      {columns.map((column) => (
        <div
          key={column.resourceId}
          className="min-w-[16rem] flex-1"
          data-testid="schedule-resource-column"
        >
          <p className="mb-2 truncate text-sm font-semibold text-gray-900">{column.resourceName}</p>
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
          />
        </div>
      ))}
    </div>
  );
}
