'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isSameDay, toDateKey } from '@/lib/utils/date-utils';

export interface WeekNavProps {
  readonly windowStart: Date;
  readonly windowDays: number;
  readonly today: Date;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly disablePrev?: boolean;
  readonly disableNext?: boolean;
  readonly activeDates?: ReadonlySet<string>;
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function formatMonthYear(date: Date): string {
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date);
  const year = date.getFullYear();
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`;
}

export function WeekNav({
  windowStart,
  windowDays,
  today,
  onPrev,
  onNext,
  disablePrev = false,
  disableNext = false,
  activeDates,
}: WeekNavProps): React.JSX.Element {
  const days: Date[] = [];
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(windowStart);
    d.setDate(windowStart.getDate() + i);
    days.push(d);
  }

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
          const isToday = isSameDay(day, today);
          const hasActivity = activeDates?.has(toDateKey(day)) ?? false;

          return (
            <div
              key={toDateKey(day)}
              data-testid="week-day"
              data-date={toDateKey(day)}
              data-today={isToday ? 'true' : undefined}
              className={[
                'flex min-w-[2.5rem] flex-col items-center gap-0.5 rounded-[0.625rem] px-1.5 py-2',
                isToday
                  ? 'bg-blue-600 text-white'
                  : 'cursor-default text-gray-800 hover:bg-gray-100',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span
                className={`text-[0.6875rem] font-semibold uppercase tracking-wide ${isToday ? 'text-blue-100' : 'text-gray-400'}`}
              >
                {DAY_LABELS[day.getDay()]}
              </span>
              <span className={`text-base font-bold leading-none ${isToday ? 'text-white' : ''}`}>
                {day.getDate()}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  hasActivity ? (isToday ? 'bg-white/80' : 'bg-blue-600') : 'bg-transparent'
                }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
