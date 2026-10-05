'use client';

import { useTranslations } from 'next-intl';
import {
  buildBlockStyle,
  getBlockMinHeightPx,
  type BufferTimelineEvent,
  type TimelineDayData,
} from '@/features/booking/schedule/schedule-timeline';
import { TimelineBlockShell } from './TimelineBlockShell';

// M18-S10 — amber hatched segment under a booking, matching
// plan/journey/staff/prototypes/horarios/09-colunas-buffer.html: who is held and until when, and
// why. Informational only — no click target, drawn beneath bookings/closures (z-[5]) and never in
// a booking's lane.
const BUFFER_HATCH =
  'repeating-linear-gradient(45deg, rgba(245,158,11,0.22) 0, rgba(245,158,11,0.22) 6px, rgba(255,251,235,0.95) 6px, rgba(255,251,235,0.95) 12px)';

function bufferOriginLabels(
  event: BufferTimelineEvent,
  t: ReturnType<typeof useTranslations>,
): { readonly origin: string; readonly tooltip: string } {
  const { resourceName, releasesAtLocalTime: time, serviceName, gap } = event;
  if (gap?.source === 'SERVICE_BUFFER') {
    const values = { service: serviceName, minutes: gap.minutes, resource: resourceName, time };
    return {
      origin: t('dayGridBufferServiceBuffer', values),
      tooltip: t('dayGridBufferTooltipServiceBuffer', values),
    };
  }
  if (gap?.source === 'RESOURCE_TURNOVER') {
    const values = { minutes: gap.minutes, resource: resourceName, time };
    return {
      origin: t('dayGridBufferResourceTurnover', values),
      tooltip: t('dayGridBufferTooltipResourceTurnover', values),
    };
  }
  // A row written before the origin was recorded: say so rather than guessing a cause.
  return {
    origin: t('dayGridBufferUnknownOrigin'),
    tooltip: t('dayGridBufferTooltipUnknownOrigin', { resource: resourceName, time }),
  };
}

interface ScheduleBufferBlockProps {
  readonly event: BufferTimelineEvent;
  readonly compact: boolean;
  readonly timeline: TimelineDayData;
  readonly slotGranularityMinutes: number;
}

export function ScheduleBufferBlock({
  event,
  compact,
  timeline,
  slotGranularityMinutes,
}: ScheduleBufferBlockProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedule');
  const blockStyle = buildBlockStyle(
    event.startMinutes,
    event.endMinutes,
    timeline.timelineStartMinutes,
    timeline.timelineEndMinutes,
    slotGranularityMinutes,
    timeline.slotHeight,
  );
  const { origin, tooltip } = bufferOriginLabels(event, t);

  return (
    <TimelineBlockShell
      compact={compact}
      className="z-[5] cursor-help border-l-[3px] border-amber-600 text-amber-900 shadow-none"
      style={{
        ...blockStyle,
        left: 0,
        width: '100%',
        minHeight: `${getBlockMinHeightPx(compact, 0)}px`,
        backgroundImage: BUFFER_HATCH,
      }}
      testId={`schedule-buffer-block-${event.id}`}
      tooltip={tooltip}
      title={t('dayGridBufferHeading', {
        resource: event.resourceName,
        time: event.releasesAtLocalTime,
      })}
      subtitle={origin}
    />
  );
}
