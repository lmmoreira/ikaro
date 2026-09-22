'use client';

import { useTranslations } from 'next-intl';
import type { BookingStatus, ScheduleClosure, ScheduleOpening } from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { cn } from '@/shared/utils/cn';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { toLocalDate, type TimelineDayData } from '@/features/booking/schedule/schedule-timeline';
import type { ScheduleWeekDayInfo } from '@/features/booking/schedule/schedule-page-derived';
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

function resolveWeekDayBadge(
  timeline: TimelineDayData,
  isClosed: boolean,
  t: (key: string) => string,
): { className: string; label: string } {
  if (timeline.selectedOpening) {
    return { className: 'bg-emerald-100 text-emerald-800', label: t('specialOpeningBadge') };
  }
  if (isClosed) {
    return { className: 'bg-gray-100 text-gray-700', label: t('statusClosed') };
  }
  return { className: 'bg-blue-100 text-blue-800', label: t('statusRegularOpen') };
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

  return (
    <div className="space-y-3" data-testid="schedule-week-view">
      <div className="grid gap-3 lg:grid-cols-7">
        {weekDayInfo.map((day, index) => {
          const timeline = weekTimelineCards[index];
          const isSelected = day.dateKey === selectedDateKey;
          const isToday = day.dateKey === todayKey;
          const { weekdayClass, numberClass } = resolveWeekDayCardClasses(isSelected, isToday);
          const { className: badgeClassName, label: badgeLabel } = resolveWeekDayBadge(
            timeline,
            day.isClosed,
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
                <Badge className={cn('shrink-0 border-0 text-[0.625rem]', badgeClassName)}>
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
                />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
