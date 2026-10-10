'use client';

import { useTranslations } from 'next-intl';
import type { RecurringScheduleConflict, RecurringScheduleConflictReason } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface NewRecurringScheduleConflictListProps {
  readonly conflicts: readonly RecurringScheduleConflict[];
  readonly durationMinutes: number;
  readonly title: string;
}

const REASON_BADGE_CLASSES: Record<RecurringScheduleConflictReason, string> = {
  OCCUPIED: 'bg-red-100 text-red-800',
  CLOSED: 'bg-gray-200 text-gray-700',
  OUTSIDE_HOURS: 'bg-amber-100 text-amber-800',
};

/**
 * The occurrences of a refused pattern, each with the reason it cannot be honored — an existing
 * booking, a closed day or hours outside the opening hours. One component for `06b` and `06d`: only
 * the data differs.
 */
export function NewRecurringScheduleConflictList({
  conflicts,
  durationMinutes,
  title,
}: NewRecurringScheduleConflictListProps): React.JSX.Element {
  const tn = useTranslations('customer.recurringSchedules.new');
  const { formatDate, formatTime } = useFormatting();

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <ul className="mt-2 flex flex-col gap-2" data-testid="conflict-list">
        {conflicts.map((conflict) => {
          const start = new Date(conflict.occurrenceStart);
          const end = new Date(start.getTime() + durationMinutes * 60_000);
          return (
            <li
              key={`${conflict.occurrenceStart}-${conflict.reason}`}
              data-testid="conflict-item"
              data-reason={conflict.reason}
              className="rounded-lg border border-gray-100 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">
                  {tn('occurrenceLine', {
                    date: formatDate(start),
                    from: formatTime(start),
                    to: formatTime(end),
                  })}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${REASON_BADGE_CLASSES[conflict.reason]}`}
                >
                  {tn(`reason${conflict.reason}`)}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{tn(`reasonDetail${conflict.reason}`)}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
