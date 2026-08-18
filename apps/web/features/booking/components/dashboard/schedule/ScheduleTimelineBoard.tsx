'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/shared/components/ui/badge';
import { Unlock } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { minutesToTime } from '@/features/booking/schedule/date-utils';
import type { TimelineDayData } from '@/features/booking/schedule/schedule-timeline';
import {
  renderTimelineEvent,
  type ScheduleTimelineRenderProps,
} from './ScheduleTimelineEventRenderer';

interface ScheduleTimelineBoardProps extends ScheduleTimelineRenderProps {
  readonly timeline: TimelineDayData;
  readonly compact: boolean;
  readonly slotLabels: readonly string[];
}

function TimelineEmptyState({
  compact,
  t,
}: {
  readonly compact: boolean;
  readonly t: ReturnType<typeof useTranslations>;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 text-center',
        compact ? 'min-h-[10rem]' : 'min-h-[14rem] p-6',
      )}
    >
      <div className="space-y-2">
        <div
          className={cn(
            'mx-auto flex items-center justify-center rounded-full bg-gray-100 text-gray-500',
            compact ? 'h-8 w-8' : 'mb-3 h-11 w-11',
          )}
        >
          <Unlock className={cn(compact ? 'h-4 w-4' : 'h-5 w-5')} />
        </div>
        <p className={cn('font-semibold text-gray-900', compact ? 'text-xs' : 'text-sm')}>
          {t('statusClosed')}
        </p>
        <p className={cn('text-gray-500', compact ? 'text-[0.625rem]' : 'text-sm')}>
          {t('closedDayEmpty')}
        </p>
      </div>
    </div>
  );
}

function TimelineCompactBoard({
  timeline,
  props,
  t,
}: {
  readonly timeline: TimelineDayData;
  readonly props: ScheduleTimelineBoardProps;
  readonly t: ReturnType<typeof useTranslations>;
}): React.JSX.Element {
  const timelineHeight = timeline.slotCount * timeline.slotHeight;
  const bookingCount = timeline.events.filter((event) => event.kind === 'booking').length;
  const compactLabelStep = Math.max(1, Math.round(60 / props.slotGranularityMinutes));
  const compactLabelIndexes = Array.from({ length: timeline.slotCount }, (_, index) => index)
    .filter((index) => index % compactLabelStep === 0)
    .filter((index, position, indexes) => indexes.indexOf(index) === position);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge
          className={cn(
            'border-0',
            timeline.selectedOpening
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-gray-100 text-gray-700',
          )}
        >
          {timeline.selectedOpening ? t('specialOpeningBadge') : t('statusRegularOpen')}
        </Badge>
        {bookingCount > 0 ? (
          <span className="text-[0.625rem] font-medium uppercase tracking-[0.08em] text-gray-500">
            {t('bookingsOnDay', { count: bookingCount })}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-0">
        <div className="relative" style={{ height: `${timelineHeight}px` }}>
          {compactLabelIndexes.map((index) => (
            <div
              key={`compact-label-${timeline.timelineStartMinutes}-${index}`}
              className="absolute left-0 -translate-y-1/2 pr-2 text-[0.625rem] font-semibold text-gray-400"
              style={{ top: `${index * timeline.slotHeight}px` }}
            >
              {minutesToTime(timeline.timelineStartMinutes + index * props.slotGranularityMinutes)}
            </div>
          ))}
        </div>

        <div
          className="relative rounded-2xl border border-gray-200 bg-gray-50"
          style={{ height: `${timelineHeight}px` }}
        >
          {Array.from({ length: timeline.slotCount }, (_, index) => (
            <div
              key={`compact-line-${timeline.timelineStartMinutes}-${index}`}
              className="absolute inset-x-0 border-t border-gray-200"
              style={{ top: `${index * timeline.slotHeight}px` }}
            />
          ))}

          {timeline.events.map((event) => renderTimelineEvent(event, timeline, true, props, t))}
        </div>
      </div>
    </div>
  );
}

function TimelineDesktopBoard({
  timeline,
  props,
  t,
}: {
  readonly timeline: TimelineDayData;
  readonly props: ScheduleTimelineBoardProps;
  readonly t: ReturnType<typeof useTranslations>;
}): React.JSX.Element {
  const timelineHeight = timeline.slotCount * timeline.slotHeight;

  return (
    <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-0">
      <div className="relative" style={{ height: `${timelineHeight}px` }}>
        {props.slotLabels.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="flex items-start pr-2 pt-1 text-[0.6875rem] font-semibold text-gray-400"
            style={{ height: `${timeline.slotHeight}px` }}
          >
            {label}
          </div>
        ))}
      </div>

      <div
        className="relative rounded-2xl border border-gray-200 bg-gray-50"
        style={{ height: `${timelineHeight}px` }}
      >
        {Array.from({ length: timeline.slotCount }, (_, index) => (
          <div
            key={`line-${timeline.timelineStartMinutes}-${index}`}
            className="absolute inset-x-0 border-t border-gray-200"
            style={{ top: `${index * timeline.slotHeight}px` }}
          />
        ))}

        {timeline.events.map((event) => renderTimelineEvent(event, timeline, false, props, t))}
      </div>
    </div>
  );
}

// Extracted from SchedulePage (TD37-S5A) — the timeline board layout (empty state, compact
// week-card board, desktop day board) is a cohesive, self-contained piece of the page, independent
// of the per-event rendering it delegates to (ScheduleTimelineEventRenderer) and of the
// data-fetching/state above it.
export function ScheduleTimelineBoard(props: ScheduleTimelineBoardProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedule');
  const { timeline, compact } = props;
  const hasHours = !timeline.selectedDayClosed;

  if (!hasHours) {
    return <TimelineEmptyState compact={compact} t={t} />;
  }

  if (compact) {
    return <TimelineCompactBoard timeline={timeline} props={props} t={t} />;
  }

  return <TimelineDesktopBoard timeline={timeline} props={props} t={t} />;
}
