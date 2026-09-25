import { cn } from '@/shared/utils/cn';

// Extracted from ScheduleTimelineEventRenderer.tsx (TD44 Story 2) purely to stay under the
// 250-line file cap — same reasoning as that file's own TimelineBlockShell extraction. Replaces
// the old resourceNames.map(...) multi-badge trailing row (unbounded height growth as match count
// grew, TD44-S1's own flagged overflow risk). Fixed-shape instead: zero matches renders nothing;
// one match shows just the name; two or more show the type-prioritized name (priority is baked
// into resourceNames' own order — see buildBookingResourceNamesById/compareResourceIdsByTypePriority
// in schedule-page-timeline-derived.ts/schedule-resource-priority.ts) followed by a "+N" count of
// the rest. The aria-label carries every matched name, not just the visible one, so a screen
// reader gets the full set behind the "+N".
export function BookingResourceSummaryLine({
  resourceNames,
  compact,
}: {
  readonly resourceNames: readonly string[];
  readonly compact: boolean;
}): React.JSX.Element | null {
  if (resourceNames.length === 0) return null;

  const remainingCount = resourceNames.length - 1;

  return (
    <div
      data-testid="timeline-block-resource-summary"
      role="group"
      aria-label={resourceNames.join(', ')}
      className={cn(
        'truncate border-t border-current/10 pt-1 font-medium opacity-80',
        compact ? 'text-[0.625rem]' : 'text-[0.6875rem]',
      )}
    >
      {resourceNames[0]}
      {remainingCount > 0 ? ` +${remainingCount}` : ''}
    </div>
  );
}
