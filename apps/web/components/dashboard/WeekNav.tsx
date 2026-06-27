'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFormatting } from '@/lib/formatting/use-formatting';
import { addDays, isSameDay, toDateKey } from '@/lib/utils/date-utils';

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
                isSelected
                  ? 'bg-gray-950 text-white ring-2 ring-blue-200'
                  : isToday
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-800 hover:bg-gray-100',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span
                className={`text-[0.6875rem] font-semibold uppercase tracking-wide ${
                  isSelected ? 'text-gray-200' : isToday ? 'text-blue-100' : 'text-gray-400'
                }`}
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
                className={`h-1.5 w-1.5 rounded-full ${
                  hasActivity
                    ? isSelected || isToday
                      ? 'bg-white/80'
                      : 'bg-blue-600'
                    : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
