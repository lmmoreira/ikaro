'use client';

import { useTranslations } from 'next-intl';
import type { BookingStatus, ScheduleClosure, ScheduleOpening } from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { cn } from '@/shared/utils/cn';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { toLocalDate, type TimelineDayData } from '@/features/booking/schedule/schedule-timeline';
import type { ScheduleWeekDayInfo } from '@/features/booking/schedule/schedule-page-derived';
import { getLocalTimeKey, timeToMinutes } from '@/features/booking/schedule/date-utils';
import {
  resolveNowMarkerTopPx,
  useScrollToNowOnce,
} from '@/features/booking/schedule/schedule-scroll-to-now';
import { ScheduleTimelineBoard } from './ScheduleTimelineBoard';

interface ScheduleWeekViewProps {
  readonly weekDayInfo: readonly ScheduleWeekDayInfo[];
  readonly weekTimelineCards: readonly TimelineDayData[];
  readonly selectedDateKey: string;
  readonly todayKey: string;
  readonly onSelectDate: (dateKey: string) => void;
  readonly slotGranularityMinutes: number;
  readonly statusLabels: Record<BookingStatus, string>;
  readonly timezone: string;
  readonly scheduleReturnTo: string;
  readonly onOpeningClick: (opening: ScheduleOpening) => void;
  readonly onClosureClick: (closure: ScheduleClosure) => void;
}

function resolveWeekDayCardClasses(
  isSelected: boolean,
  isToday: boolean,
): { weekdayClass: string; numberClass: string } {
  let weekdayClass = 'text-gray-400';
  if (isSelected) {
    weekdayClass = 'text-white/80';
  } else if (isToday) {
    weekdayClass = 'text-blue-600';
  }

  let numberClass = 'text-gray-900';
  if (isSelected) {
    numberClass = 'text-white';
  } else if (isToday) {
    numberClass = 'text-blue-600';
  }

  return { weekdayClass, numberClass };
}

// TD44 Story 4 — the day-card badge used to restate the open/special-opening/closed status,
// which is already visible from the grid itself (an open day shows its hour grid, a closed one
// shows the "Fechado" empty state) — purely redundant text.
// Replaced with a booking count instead, which the grid doesn't otherwise surface as a single
// glanceable number: 0 (gray, "Sem agendamentos"/muted) vs. 1+ (blue, count) gives a quick signal
// of which days actually have something to look at.
function resolveWeekDayBookingCountBadge(
  timeline: TimelineDayData,
  t: ReturnType<typeof useTranslations>,
): { className: string; label: string } {
  const bookingCount = timeline.events.filter((event) => event.kind === 'booking').length;
  return {
    className: bookingCount > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700',
    label: t('bookingsOnDay', { count: bookingCount }),
  };
}

// Extracted from SchedulePage (TD37-S5A) — the week-mode grid of 7 day cards is a self-contained
// view, independent of the mobile/day-mode single-card view rendered alongside it.
export function ScheduleWeekView({
  weekDayInfo,
  weekTimelineCards,
  selectedDateKey,
  todayKey,
  onSelectDate,
  slotGranularityMinutes,
  statusLabels,
  timezone,
  scheduleReturnTo,
  onOpeningClick,
  onClosureClick,
}: ScheduleWeekViewProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedule');
  const { formatWeekdayShort } = useFormatting();

  // TD44 Story 4 — scroll-to-now, keyed off the visible week's own start date (not selectedDateKey,
  // which changes when the user just clicks a different day-card within the same week and must not
  // re-trigger the scroll). Fires only when today is actually one of the 7 visible days.
  const weekKey = weekDayInfo[0]?.dateKey ?? '';
  const weekIncludesToday = weekDayInfo.some((day) => day.dateKey === todayKey);
  const nowMarkerRef = useScrollToNowOnce(weekIncludesToday, weekKey);
  const nowMinutes = timeToMinutes(getLocalTimeKey(new Date(), timezone));

  return (
    <div className="space-y-3" data-testid="schedule-week-view">
      <div className="grid gap-3 lg:grid-cols-7">
        {weekDayInfo.map((day, index) => {
          const timeline = weekTimelineCards[index];
          const isSelected = day.dateKey === selectedDateKey;
          const isToday = day.dateKey === todayKey;
          const { weekdayClass, numberClass } = resolveWeekDayCardClasses(isSelected, isToday);
          const { className: badgeClassName, label: badgeLabel } = resolveWeekDayBookingCountBadge(
            timeline,
            t,
          );

          return (
            <section
              key={day.dateKey}
              data-testid="schedule-week-day-card"
              className={cn(
                'overflow-hidden rounded-2xl border bg-white shadow-sm',
                isSelected ? 'border-blue-200 ring-2 ring-blue-100' : 'border-gray-200',
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDate(day.dateKey)}
                className={cn(
                  'flex w-full items-start justify-between gap-2 px-3 py-3 text-left transition-colors hover:bg-blue-50/50',
                  isSelected ? 'bg-blue-50/70' : '',
                )}
              >
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-[0.6875rem] font-semibold uppercase tracking-wide',
                      weekdayClass,
                    )}
                  >
                    {formatWeekdayShort(toLocalDate(day.dateKey))}
                  </p>
                  <p className={cn('text-sm font-semibold leading-none', numberClass)}>
                    {toLocalDate(day.dateKey).getDate()}
                  </p>
                </div>
                <Badge
                  data-testid="schedule-week-day-badge"
                  className={cn('shrink-0 border-0 text-[0.625rem]', badgeClassName)}
                >
                  {badgeLabel}
                </Badge>
              </button>

              <div className="border-t border-gray-100 p-3">
                <ScheduleTimelineBoard
                  timeline={timeline}
                  compact
                  slotGranularityMinutes={slotGranularityMinutes}
                  slotLabels={[]}
                  statusLabels={statusLabels}
                  timezone={timezone}
                  scheduleReturnTo={scheduleReturnTo}
                  onOpeningClick={onOpeningClick}
                  onClosureClick={onClosureClick}
                  nowMarkerRef={isToday ? nowMarkerRef : undefined}
                  nowMarkerTopPx={
                    isToday
                      ? resolveNowMarkerTopPx(timeline, slotGranularityMinutes, nowMinutes)
                      : undefined
                  }
                />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
