'use client';

import type { ReactNode } from 'react';

interface ScheduleRemovalSummaryProps {
  readonly title?: ReactNode;
  readonly dateLabel: string;
  readonly rangeLabel: string;
  readonly notesLabel: string;
  readonly notes?: string | null;
  // Set only for a resource-scoped closure/opening (resourceId not null) — omitted entirely for
  // a tenant-wide one, since there's no single resource to name.
  readonly resourceLabel?: string | null;
}

export function ScheduleRemovalSummary({
  title,
  dateLabel,
  rangeLabel,
  notesLabel,
  notes,
  resourceLabel,
}: ScheduleRemovalSummaryProps): React.JSX.Element {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      {title ? <p className="text-sm font-semibold text-gray-900">{title}</p> : null}
      <p
        className={
          title ? 'mt-1 text-sm text-gray-600' : 'mt-1 text-sm font-semibold text-gray-900'
        }
      >
        {dateLabel}
      </p>
      <p className="mt-1 text-sm text-gray-600">{rangeLabel}</p>
      {resourceLabel ? (
        <p data-testid="schedule-removal-resource-label" className="mt-1 text-sm text-gray-600">
          {resourceLabel}
        </p>
      ) : null}
      {notes ? (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
            {notesLabel}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{notes}</p>
        </div>
      ) : null}
    </div>
  );
}
