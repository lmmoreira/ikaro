'use client';

import { useTranslations } from 'next-intl';
import type { BookingStatus, ScheduleClosure, ScheduleOpening } from '@ikaro/types';
import { AlertTriangle, CalendarDays, Lock } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { cn } from '@/shared/utils/cn';
import { SCHEDULE_BOOKING_TIMELINE_CLASSES } from '@/features/booking/model/booking-status';
import { getLocalTimeKey } from '@/features/booking/schedule/date-utils';
import {
  buildBlockStyle,
  formatEventRange,
  getBlockMinHeightPx,
  getClosureReasonLabel,
  type BookingTimelineEvent,
  type ClosureTimelineEvent,
  type OpeningTimelineEvent,
  type TimelineDayData,
  type TimelineEvent,
} from '@/features/booking/schedule/schedule-timeline';
import { TimelineBlockShell } from './TimelineBlockShell';
import { BookingResourceSummaryLine } from './BookingResourceSummaryLine';

export interface ScheduleTimelineRenderProps {
  readonly slotGranularityMinutes: number;
  readonly statusLabels: Record<BookingStatus, string>;
  readonly timezone: string;
  readonly scheduleReturnTo: string;
  readonly onOpeningClick: (opening: ScheduleOpening) => void;
  readonly onClosureClick: (closure: ScheduleClosure) => void;
}

function renderBookingTimelineEvent(
  event: BookingTimelineEvent,
  compact: boolean,
  timeline: TimelineDayData,
  props: ScheduleTimelineRenderProps,
): React.JSX.Element {
  const blockStyle = buildBlockStyle(
    event.startMinutes,
    event.endMinutes,
    timeline.timelineStartMinutes,
    timeline.timelineEndMinutes,
    props.slotGranularityMinutes,
    timeline.slotHeight,
  );
  const laneWidth = 100 / event.laneCount;
  const laneLeft = laneWidth * event.laneIndex;
  // A booking at the schedule's minimum granularity drops the time-range line in every board (its
  // position in the grid already conveys the time now that item 1 restored a readable grid
  // density). In compact mode specifically (Week view), it also drops the resource-summary line —
  // Week view's own grid stays meaningfully denser than Day view even after re-tuning its scale, so
  // a 2-line floor is what actually lets a 30-min block's rendered height approach its true slot
  // height (see schedule-timeline-formatting.ts's content-aware floor this feeds). Desktop keeps
  // the resource line unconditionally per the original design — its natural slot height already
  // absorbs a 3-line floor reasonably.
  const isMinimumGranularity = event.booking.totalDurationMins === props.slotGranularityMinutes;
  const showResourceLine = event.resourceNames.length > 0 && !(compact && isMinimumGranularity);
  const showTimeRangeLine = !isMinimumGranularity;
  const extraLineCount = Number(showResourceLine) + Number(showTimeRangeLine);
  // Content-fit floor, decoupled from the grid's own coordinate unit (TD44 Story 4) — lets this
  // block render visually taller than its own slot when its content needs it, without affecting
  // slotHeight/top for any other block.
  const minHeight = `${getBlockMinHeightPx(compact, extraLineCount)}px`;

  return (
    <TimelineBlockShell
      key={event.id}
      compact={compact}
      className={cn(
        'z-20 hover:shadow-md',
        event.warning
          ? 'border-orange-300 bg-orange-50 text-orange-950'
          : SCHEDULE_BOOKING_TIMELINE_CLASSES[event.booking.status],
      )}
      style={{ ...blockStyle, left: `${laneLeft}%`, width: `${laneWidth}%`, minHeight }}
      href={`/dashboard/bookings/${event.booking.bookingId}?returnTo=${encodeURIComponent(
        props.scheduleReturnTo,
      )}`}
      ariaLabel={
        event.resourceNames.length > 0
          ? `${event.booking.contactName}, ${event.resourceNames.join(', ')}`
          : event.booking.contactName
      }
      icon={
        event.warning ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" /> : null
      }
      title={event.title}
      subtitle={event.subtitle}
      trailing={
        <Badge
          variant="outline"
          className={cn(
            'shrink-0 border-0',
            compact ? 'text-[0.62rem]' : 'text-[0.6875rem]',
            SCHEDULE_BOOKING_TIMELINE_CLASSES[event.booking.status],
          )}
        >
          {props.statusLabels[event.booking.status]}
        </Badge>
      }
      footer={
        <div className="flex flex-col gap-1">
          <BookingResourceSummaryLine
            resourceNames={showResourceLine ? event.resourceNames : []}
            compact={compact}
          />
          {showTimeRangeLine ? (
            <div
              data-testid="timeline-block-time-range"
              className={cn('opacity-80', compact ? 'text-[0.625rem]' : 'text-[0.6875rem]')}
            >
              {formatEventRange(
                getLocalTimeKey(new Date(event.booking.scheduledAt), props.timezone),
                getLocalTimeKey(
                  new Date(
                    new Date(event.booking.scheduledAt).getTime() +
                      event.booking.totalDurationMins * 60_000,
                  ),
                  props.timezone,
                ),
              )}
            </div>
          ) : null}
        </div>
      }
    />
  );
}

// Extracted from renderOpeningTimelineEvent/renderClosureTimelineEvent below — a small pill
// naming which resource a block belongs to, shown only when the block is resource-scoped (a
// tenant-wide block has no single resource to name, so nothing renders). MANAGER-only in
// practice: resourceName is only ever non-null when the resourceNameById lookup was populated,
// which only happens for MANAGER (see schedule-page-core-data.ts).
function ResourceNameBadge({
  resourceName,
}: {
  readonly resourceName: string | null;
}): React.JSX.Element | null {
  if (!resourceName) return null;
  return (
    <Badge
      variant="outline"
      data-testid="timeline-block-resource-name"
      className="shrink-0 border-0 bg-white/70 text-[0.625rem] font-medium"
    >
      {resourceName}
    </Badge>
  );
}

function renderOpeningTimelineEvent(
  event: OpeningTimelineEvent,
  compact: boolean,
  timeline: TimelineDayData,
  props: ScheduleTimelineRenderProps,
  t: ReturnType<typeof useTranslations>,
): React.JSX.Element {
  const blockStyle = buildBlockStyle(
    event.startMinutes,
    event.endMinutes,
    timeline.timelineStartMinutes,
    timeline.timelineEndMinutes,
    props.slotGranularityMinutes,
    timeline.slotHeight,
  );
  const laneWidth = 100 / event.laneCount;
  const laneLeft = laneWidth * event.laneIndex;
  // A resource-scoped opening's window always sits inside the tenant-wide one (see
  // findTenantWideOpening's note in schedule-timeline.ts) — a higher z-index keeps it readable
  // on top of that full-width backdrop instead of blending into it.
  const isResourceScoped = event.resourceName !== null;
  // Opening blocks never render a footer (only title/subtitle + the trailing resource badge) — 0
  // extra lines, same content shape regardless of duration.
  const minHeight = `${getBlockMinHeightPx(compact, 0)}px`;

  return (
    <TimelineBlockShell
      key={event.id}
      compact={compact}
      className={cn(
        'border-emerald-200 bg-emerald-50 text-emerald-950 hover:bg-emerald-100',
        isResourceScoped ? 'z-[15] border-emerald-300 shadow-md' : 'z-10',
      )}
      style={{ ...blockStyle, left: `${laneLeft}%`, width: `${laneWidth}%`, minHeight }}
      testId={`schedule-opening-block-${event.opening.id}`}
      onClick={() => props.onOpeningClick(event.opening)}
      icon={<CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />}
      title={t('specialOpeningBadge')}
      subtitle={
        event.opening.notes ?? formatEventRange(event.opening.startTime, event.opening.endTime)
      }
      trailing={<ResourceNameBadge resourceName={event.resourceName} />}
    />
  );
}

function renderClosureTimelineEvent(
  event: ClosureTimelineEvent,
  compact: boolean,
  timeline: TimelineDayData,
  props: ScheduleTimelineRenderProps,
  t: ReturnType<typeof useTranslations>,
): React.JSX.Element {
  const blockStyle = buildBlockStyle(
    event.startMinutes,
    event.endMinutes,
    timeline.timelineStartMinutes,
    timeline.timelineEndMinutes,
    props.slotGranularityMinutes,
    timeline.slotHeight,
  );
  const laneWidth = 100 / event.laneCount;
  const laneLeft = laneWidth * event.laneIndex;
  // Closure blocks never render a footer either — same reasoning as the opening block above.
  const minHeight = `${getBlockMinHeightPx(compact, 0)}px`;

  return (
    <TimelineBlockShell
      key={event.id}
      compact={compact}
      className="z-10 border-slate-200 text-slate-900 hover:bg-slate-100"
      style={{
        ...blockStyle,
        left: `${laneLeft}%`,
        width: `${laneWidth}%`,
        minHeight,
        backgroundImage:
          'repeating-linear-gradient(135deg, rgba(148,163,184,0.18) 0, rgba(148,163,184,0.18) 8px, rgba(248,250,252,0.95) 8px, rgba(248,250,252,0.95) 16px)',
      }}
      testId={`schedule-closure-block-${event.closure.id}`}
      onClick={() => props.onClosureClick(event.closure)}
      icon={<Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />}
      title={getClosureReasonLabel(t, event.closure.reason)}
      subtitle={
        event.closure.startTime && event.closure.endTime
          ? formatEventRange(event.closure.startTime, event.closure.endTime)
          : t('allDay')
      }
      trailing={<ResourceNameBadge resourceName={event.resourceName} />}
    />
  );
}

// Extracted from SchedulePage (TD37-S5A) — mapping a single timeline event (booking/opening/
// closure) to its rendered block is a cohesive, self-contained concern, independent of the board
// layout (compact/desktop grid) that positions many of these.
export function renderTimelineEvent(
  event: TimelineEvent,
  timeline: TimelineDayData,
  compact: boolean,
  props: ScheduleTimelineRenderProps,
  t: ReturnType<typeof useTranslations>,
): React.JSX.Element {
  if (event.kind === 'booking') {
    return renderBookingTimelineEvent(event, compact, timeline, props);
  }

  if (event.kind === 'opening') {
    return renderOpeningTimelineEvent(event, compact, timeline, props, t);
  }

  return renderClosureTimelineEvent(event, compact, timeline, props, t);
}
