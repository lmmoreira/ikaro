'use client';

import { useTranslations } from 'next-intl';
import {
  buildProportionalBlockStyle,
  type BufferTimelineEvent,
  type TimelineDayData,
} from '@/features/booking/schedule/schedule-timeline';
import { cn } from '@/shared/utils/cn';

// M18-S10 — amber hatched segment under a booking, matching
// journeys/staff/prototypes/horarios/09-colunas-buffer.html: who is held and until when, and
// why. Informational only — no click target, drawn beneath bookings/closures (z-[5]) and never in
// a booking's lane. Drawn at its true proportional height (a 10-min buffer is 1/3 of a 30-min
// slot, not a full slot): the one-line label is clipped away when the block is too short to hold
// it, the origin ("Buffer do serviço … · N min") joins as a second line only when the block is tall
// enough for two, and the full sentence always lives in the tooltip.
const BUFFER_HATCH =
  'repeating-linear-gradient(45deg, rgba(245,158,11,0.22) 0, rgba(245,158,11,0.22) 6px, rgba(255,251,235,0.95) 6px, rgba(255,251,235,0.95) 12px)';

// Below this height a text line no longer fits — only the hatch and the tooltip remain.
const MIN_LABEL_HEIGHT_PX = 16;
// From this height the origin line fits under the heading.
const MIN_ORIGIN_HEIGHT_PX = 36;

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
  const { top, height } = buildProportionalBlockStyle(
    event.startMinutes,
    event.endMinutes,
    timeline.timelineStartMinutes,
    timeline.timelineEndMinutes,
    slotGranularityMinutes,
    timeline.slotHeight,
  );
  const { origin, tooltip } = bufferOriginLabels(event, t);
  const showLabel = height >= MIN_LABEL_HEIGHT_PX;
  const showOrigin = height >= MIN_ORIGIN_HEIGHT_PX;
  const textSize = compact ? 'text-[0.625rem]' : 'text-[0.6875rem]';

  return (
    <div
      role="note"
      title={tooltip}
      aria-label={tooltip}
      data-testid="schedule-buffer-block"
      data-buffer-id={event.id}
      className="absolute z-[5] flex cursor-help flex-col justify-center overflow-hidden border-l-[3px] border-amber-600 px-2 text-amber-900"
      style={{ top, height, left: 0, width: '100%', backgroundImage: BUFFER_HATCH }}
    >
      {showLabel ? (
        <p className={cn('truncate font-normal leading-tight', textSize)}>
          {t('dayGridBufferHeading', {
            resource: event.resourceName,
            time: event.releasesAtLocalTime,
          })}
        </p>
      ) : null}
      {showOrigin ? (
        <p className={cn('truncate font-normal leading-tight opacity-80', textSize)}>{origin}</p>
      ) : null}
    </div>
  );
}
