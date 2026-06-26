'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface WeekNavProps {
  readonly startOfWeek: Date;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly disablePrev?: boolean;
  readonly disableNext?: boolean;
}

function formatMonthYear(date: Date): string {
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date);
  const year = date.getFullYear();
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`;
}

export function WeekNav({
  startOfWeek,
  onPrev,
  onNext,
  disablePrev = false,
  disableNext = false,
}: WeekNavProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between px-1 py-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={disablePrev}
        aria-label="Semana anterior"
        className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <span className="text-sm font-medium text-gray-700" data-testid="week-nav-label">
        {formatMonthYear(startOfWeek)}
      </span>

      <button
        type="button"
        onClick={onNext}
        disabled={disableNext}
        aria-label="Próxima semana"
        className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
