'use client';

import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
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
  // TD44 Story 4 — scroll-to-now marker, wired by the caller (ScheduleMainView/
  // ScheduleResourceColumnsBoard/ScheduleWeekView) only for the board(s) whose viewed date/week
  // actually includes "now". Omitted entirely (undefined) means no marker renders, same as today.
  readonly nowMarkerRef?: RefObject<HTMLDivElement | null>;
  readonly nowMarkerTopPx?: number;
}

function NowMarker({
  nowMarkerRef,
  nowMarkerTopPx,
}: {
  readonly nowMarkerRef?: RefObject<HTMLDivElement | null>;
  readonly nowMarkerTopPx?: number;
}): React.JSX.Element | null {
  if (!nowMarkerRef || nowMarkerTopPx === undefined) return null;
  return (
    <div
      ref={nowMarkerRef}
      data-testid="schedule-now-marker"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0"
      style={{ top: `${nowMarkerTopPx}px` }}
    />
  );
}

function TimelineEmptyState({
  compact,
  t,
  nowMarkerRef,
  nowMarkerTopPx,
}: {
  readonly compact: boolean;
  readonly t: ReturnType<typeof useTranslations>;
  readonly nowMarkerRef?: RefObject<HTMLDivElement | null>;
  readonly nowMarkerTopPx?: number;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 text-center',
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
      {/* TD44 Story 4 — a "today" that's closed still needs its marker mounted so scroll-to-now
          fires (there's nothing meaningful to scroll to within this small box, but the AC's own
          wording — "the viewed range includes today" — doesn't carve out a closed exception, and
          Week view's scroll guard is keyed per date, so a missing mount here silently blocks the
          scroll for the whole week if today happens to be the tenant's one closed weekday). */}
      <NowMarker nowMarkerRef={nowMarkerRef} nowMarkerTopPx={nowMarkerTopPx} />
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
  const compactLabelStep = Math.max(1, Math.round(60 / props.slotGranularityMinutes));
  const compactLabelIndexes = Array.from({ length: timeline.slotCount }, (_, index) => index)
    .filter((index) => index % compactLabelStep === 0)
    .filter((index, position, indexes) => indexes.indexOf(index) === position);

  return (
    <div className="space-y-2">
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
          <NowMarker nowMarkerRef={props.nowMarkerRef} nowMarkerTopPx={props.nowMarkerTopPx} />
        </div>
      </div>
    </div>
  );
}

function TimelineDesktopBoard({
  timeline,
  slotLabels,
  props,
  t,
}: {
  readonly timeline: TimelineDayData;
  readonly slotLabels: readonly string[];
  readonly props: ScheduleTimelineBoardProps;
  readonly t: ReturnType<typeof useTranslations>;
}): React.JSX.Element {
  const timelineHeight = timeline.slotCount * timeline.slotHeight;

  return (
    <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-0">
      <div className="relative" style={{ height: `${timelineHeight}px` }}>
        {slotLabels.map((label, index) => (
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
        <NowMarker nowMarkerRef={props.nowMarkerRef} nowMarkerTopPx={props.nowMarkerTopPx} />
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
  const { timeline, compact, slotLabels } = props;
  const hasHours = !timeline.selectedDayClosed;

  if (!hasHours) {
    return (
      <TimelineEmptyState
        compact={compact}
        t={t}
        nowMarkerRef={props.nowMarkerRef}
        nowMarkerTopPx={props.nowMarkerTopPx}
      />
    );
  }

  if (compact) {
    return <TimelineCompactBoard timeline={timeline} props={props} t={t} />;
  }

  return <TimelineDesktopBoard timeline={timeline} slotLabels={slotLabels} props={props} t={t} />;
}
