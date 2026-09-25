import { cn } from '@/shared/utils/cn';

// Extracted from ScheduleTimelineEventRenderer.tsx (TD44 Story 2) purely to stay under the
// 250-line file cap — same reasoning as that file's own TimelineBlockShell extraction. Replaces
// the old resourceNames.map(...) multi-badge trailing row (unbounded height growth as match count
// grew, TD44-S1's own flagged overflow risk). Fixed-shape instead: zero matches renders nothing;
// one match shows just the name; two or more show the type-prioritized name (priority is baked
// into resourceNames' own order — see buildBookingResourceNamesById/compareResourceIdsByTypePriority
// in schedule-page-timeline-derived.ts/schedule-resource-priority.ts) followed by a "+N" count of
// the rest. Purely presentational — the full matched-resource list for assistive tech is composed
// into the enclosing booking link's own `ariaLabel` by renderBookingTimelineEvent instead of living
// here. Two earlier attempts at giving *this* div its own accessible name (role="group" + aria-label,
// then an sr-only text node) both missed that the whole block is a single link whose own aria-label
// already overrides every nested element's name — an inner div's own accessible name is structurally
// unreachable to a screen reader tabbing through the page regardless of how it's built, since a
// plain div's implicit "generic" role prohibits it (aria-label or not) and role="group" tripped
// SonarCloud S6819 with no fitting native-element alternative. Fixing the link's own label is both
// the correct place per WAI-ARIA (that's the actual focusable/announced unit) and avoids both traps.
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
      aria-hidden="true"
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
