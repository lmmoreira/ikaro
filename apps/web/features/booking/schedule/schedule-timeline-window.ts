import type {
  ScheduleClosure,
  ScheduleOpening,
  TenantBusinessHours,
  TenantDayHours,
} from '@ikaro/types';
import { getDayHoursForDate } from '@/features/booking/schedule/date-utils';
import {
  assignLanes,
  buildOpeningTimelineEvent,
  type OpeningTimelineEvent,
} from '@/features/booking/schedule/schedule-timeline-events';

export interface ActiveTimelineHours {
  readonly dayOpenings: readonly ScheduleOpening[];
  readonly selectedDayClosures: ScheduleClosure[];
  readonly activeStartTime: string;
  readonly activeEndTime: string;
}

// The tenant-wide opening (resourceId null) — a resource-scoped opening for a date always
// requires one to already exist for that same date first (docs/02-DOMAIN_MODEL.md's Three-Layer
// Schedule Resolution: "the day is normally closed for the tenant and no tenant-wide opening
// exists yet for that date" is a creation-time error), so this is the reliable pick when one
// exists.
export function findTenantWideOpening(
  dayOpenings: readonly ScheduleOpening[],
): ScheduleOpening | null {
  return dayOpenings.find((opening) => opening.resourceId == null) ?? null;
}

// Extracted from resolveActiveTimelineHours below — picks the window that determines the
// visible timeline bounds. The tenant-wide opening always wins when present, since every
// resource-scoped opening on the same date is guaranteed to sit inside it (see
// findTenantWideOpening's own note). Falling back to the widest span across whatever
// resource-scoped openings exist covers the shouldn't-normally-happen case of one with no
// tenant-wide sibling, rather than silently clipping it out of the visible window.
function resolveActiveWindow(
  tenantWideOpening: ScheduleOpening | null,
  dayOpenings: readonly ScheduleOpening[],
  regularHours: TenantDayHours | null,
): { readonly start: string; readonly end: string } | null {
  if (tenantWideOpening) {
    return { start: tenantWideOpening.startTime, end: tenantWideOpening.endTime };
  }
  if (dayOpenings.length > 0) {
    const starts = dayOpenings.map((opening) => opening.startTime);
    const ends = dayOpenings.map((opening) => opening.endTime);
    return {
      start: starts.reduce((earliest, time) => (time < earliest ? time : earliest)),
      end: ends.reduce((latest, time) => (time > latest ? time : latest)),
    };
  }
  if (regularHours) return { start: regularHours.open, end: regularHours.close };
  return null;
}

// Extracted from schedule-timeline.ts's buildTimelineEvents — resolving the day's active
// closures/openings and the window they imply is a self-contained concern, independent of
// turning that window into rendered events.
export function resolveActiveTimelineHours(
  selectedDateKey: string,
  businessHours: TenantBusinessHours,
  closures: readonly ScheduleClosure[],
  openings: readonly ScheduleOpening[],
): ActiveTimelineHours | null {
  const dayOpenings = openings.filter((opening) => opening.date === selectedDateKey);
  const regularHours = getDayHoursForDate(selectedDateKey, businessHours);
  const window = resolveActiveWindow(findTenantWideOpening(dayOpenings), dayOpenings, regularHours);
  const selectedDayClosures = closures.filter((closure) => closure.date === selectedDateKey);

  if (!window) return null;

  return {
    dayOpenings,
    selectedDayClosures,
    activeStartTime: window.start,
    activeEndTime: window.end,
  };
}

// Extracted from schedule-timeline.ts's buildAllTimelineEvents — the tenant-wide opening (if
// any) always renders as its own full-width block, same as before this fix; resource-scoped
// openings render as their own blocks too, lane-split among themselves when they overlap in
// time (mirroring closures' own overlap handling) but never against the tenant-wide one, which
// stays the full-width backdrop every resource-scoped opening's window is guaranteed to sit
// inside.
export function buildOpeningTimelineEvents(
  dayOpenings: readonly ScheduleOpening[],
  resourceNameById: ReadonlyMap<string, string>,
): OpeningTimelineEvent[] {
  const tenantWideEvent = buildOpeningTimelineEvent(
    findTenantWideOpening(dayOpenings),
    resourceNameById,
  );
  const resourceScopedEvents = assignLanes(
    dayOpenings
      .filter((opening) => opening.resourceId != null)
      .map((opening) => buildOpeningTimelineEvent(opening, resourceNameById))
      .filter((event): event is OpeningTimelineEvent => event !== null),
  );

  return tenantWideEvent ? [tenantWideEvent, ...resourceScopedEvents] : resourceScopedEvents;
}
