'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { addDays, isSameDay, toDateKey } from '@/shared/utils/date-utils';

export interface WeekNavProps {
  readonly windowStart: Date;
  readonly windowDays: number;
  readonly today: Date;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly selectedDate?: string | null;
  readonly onSelectDate?: (dateKey: string) => void;
  readonly disablePrev?: boolean;
  readonly disableNext?: boolean;
  readonly activeDates?: ReadonlySet<string>;
}

function getDayButtonClass(isSelected: boolean, isToday: boolean): string {
  if (isSelected) return 'bg-gray-950 text-white ring-2 ring-blue-200';
  if (isToday) return 'bg-blue-600 text-white';
  return 'text-gray-800 hover:bg-gray-100';
}

function getWeekdayClass(isSelected: boolean, isToday: boolean): string {
  if (isSelected) return 'text-gray-200';
  if (isToday) return 'text-blue-100';
  return 'text-gray-400';
}

function getActivityDotClass(hasActivity: boolean, isHighlighted: boolean): string {
  if (!hasActivity) return 'bg-transparent';
  if (isHighlighted) return 'bg-white/80';
  return 'bg-blue-600';
}

export function WeekNav({
  windowStart,
  windowDays,
  today,
  onPrev,
  onNext,
  selectedDate,
  onSelectDate,
  disablePrev = false,
  disableNext = false,
  activeDates,
}: WeekNavProps): React.JSX.Element {
  const { formatMonthYear, formatWeekdayShort } = useFormatting();
  const days: Date[] = Array.from({ length: windowDays }, (_, i) => addDays(windowStart, i));

  const monthLabel = formatMonthYear(windowStart);

  return (
    <div className="bg-white" data-testid="week-nav">
      {/* Month + navigation row */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={disablePrev}
          aria-label="Período anterior"
          className="flex h-8 w-8 items-center justify-center rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="text-sm font-semibold text-gray-800" data-testid="week-nav-label">
          {monthLabel}
        </span>

        <button
          type="button"
          onClick={onNext}
          disabled={disableNext}
          aria-label="Próximo período"
          className="flex h-8 w-8 items-center justify-center rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day strip */}
      <div className="flex justify-evenly overflow-x-auto px-1 py-2">
        {days.map((day) => {
          const dateKey = toDateKey(day);
          const isToday = isSameDay(day, today);
          const isSelected = selectedDate === dateKey;
          const hasActivity = activeDates?.has(dateKey) ?? false;
          const isHighlighted = isSelected || isToday;

          return (
            <button
              type="button"
              key={dateKey}
              onClick={() => onSelectDate?.(dateKey)}
              aria-pressed={isSelected}
              data-testid="week-day"
              data-date={dateKey}
              data-today={isToday ? 'true' : undefined}
              data-selected={isSelected ? 'true' : undefined}
              className={[
                'flex min-w-[2.5rem] flex-col items-center gap-0.5 rounded-[0.625rem] px-1.5 py-2 transition-colors',
                getDayButtonClass(isSelected, isToday),
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span
                className={`text-[0.6875rem] font-semibold uppercase tracking-wide ${getWeekdayClass(
                  isSelected,
                  isToday,
                )}`}
              >
                {formatWeekdayShort(day)}
              </span>
              <span
                className={`text-base font-bold leading-none ${
                  isSelected || isToday ? 'text-white' : ''
                }`}
              >
                {day.getDate()}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${getActivityDotClass(
                  hasActivity,
                  isHighlighted,
                )}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
