import type { TimelineDayData } from '@/features/booking/schedule/schedule-timeline';
import { resolveSlotCount } from '@/features/booking/schedule/schedule-timeline-formatting';

export interface SharedTimelineWindowResult {
  readonly sharedStartMinutes: number;
  readonly sharedEndMinutes: number;
  readonly sharedMemberIndexes: ReadonlySet<number>;
}

// A member joins the shared axis only when it has real hours (not closed) and wasn't resolved
// from an exceptional opening (TD44 Story 3's "Resolved design") — an opening-overridden window
// must never be forced into, or stretch, a shared range other members are positioned against.
function isEligibleForSharedWindow(member: TimelineDayData): boolean {
  return !member.selectedDayClosed && !member.isOverriddenByOpening;
}

// Unions only the eligible members' ranges (widest start-to-end) — an ineligible member
// (exceptional opening, or a closed day) is excluded from the union entirely, not just from
// rendering against it.
export function resolveSharedTimelineWindow(
  members: readonly TimelineDayData[],
): SharedTimelineWindowResult {
  const sharedMemberIndexes = new Set<number>();
  let sharedStartMinutes = Infinity;
  let sharedEndMinutes = -Infinity;

  members.forEach((member, index) => {
    if (!isEligibleForSharedWindow(member)) return;
    sharedMemberIndexes.add(index);
    sharedStartMinutes = Math.min(sharedStartMinutes, member.timelineStartMinutes);
    sharedEndMinutes = Math.max(sharedEndMinutes, member.timelineEndMinutes);
  });

  if (sharedMemberIndexes.size === 0) {
    return { sharedStartMinutes: 0, sharedEndMinutes: 0, sharedMemberIndexes };
  }

  return { sharedStartMinutes, sharedEndMinutes, sharedMemberIndexes };
}

// Repositions a shared-group member's grid against the union range resolved above. Only the
// coordinate space (timelineStartMinutes/timelineEndMinutes/slotCount) changes — its own
// events/closures/openings stay exactly as already resolved, since buildBlockStyle reads the
// timeline's start/end at render time rather than baking positions into the events themselves.
export function applySharedTimelineWindow(
  member: TimelineDayData,
  sharedStartMinutes: number,
  sharedEndMinutes: number,
  slotGranularityMinutes: number,
): TimelineDayData {
  return {
    ...member,
    timelineStartMinutes: sharedStartMinutes,
    timelineEndMinutes: sharedEndMinutes,
    slotCount: resolveSlotCount(sharedStartMinutes, sharedEndMinutes, slotGranularityMinutes),
  };
}

// The hour-label column renders once for the shared group, on its first (lowest-index) member —
// every other shared member suppresses its own. An ineligible member (opt-out: overridden by an
// opening, or closed) always renders its own independent label column, wherever it sits in the
// layout — it was never part of the shared group to begin with.
export function rendersOwnLabelColumn(
  index: number,
  sharedMemberIndexes: ReadonlySet<number>,
): boolean {
  if (!sharedMemberIndexes.has(index)) return true;
  return index === Math.min(...sharedMemberIndexes);
}
