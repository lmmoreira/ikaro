import { describe, expect, it } from 'vitest';
import type { TimelineDayData } from '@/features/booking/schedule/schedule-timeline';
import { buildBlockStyle } from '@/features/booking/schedule/schedule-timeline-formatting';
import {
  applySharedTimelineWindow,
  rendersOwnLabelColumn,
  resolveSharedTimelineWindow,
} from './schedule-shared-timeline-window';

function makeTimeline(overrides: Partial<TimelineDayData> = {}): TimelineDayData {
  return {
    selectedOpening: null,
    selectedDayHours: { open: '09:00', close: '18:00' },
    selectedDayClosed: false,
    timelineStartMinutes: 540,
    timelineEndMinutes: 1080,
    slotCount: 18,
    slotHeight: 48,
    events: [],
    isOverriddenByOpening: false,
    ...overrides,
  };
}

describe('resolveSharedTimelineWindow', () => {
  it('unions the widest start-to-end across eligible members', () => {
    const result = resolveSharedTimelineWindow([
      makeTimeline({ timelineStartMinutes: 540, timelineEndMinutes: 1080 }), // 09:00-18:00
      makeTimeline({ timelineStartMinutes: 480, timelineEndMinutes: 960 }), // 08:00-16:00
    ]);

    expect(result.sharedStartMinutes).toBe(480);
    expect(result.sharedEndMinutes).toBe(1080);
    expect(result.sharedMemberIndexes).toEqual(new Set([0, 1]));
  });

  it('excludes a member overridden by an exceptional opening entirely from the union', () => {
    const result = resolveSharedTimelineWindow([
      makeTimeline({ timelineStartMinutes: 540, timelineEndMinutes: 1080 }),
      makeTimeline({
        timelineStartMinutes: 120,
        timelineEndMinutes: 1080,
        isOverriddenByOpening: true,
      }), // e.g. a 2am exceptional opening
    ]);

    // The opening-overridden member's 120-1080 window must not stretch the shared range.
    expect(result.sharedStartMinutes).toBe(540);
    expect(result.sharedEndMinutes).toBe(1080);
    expect(result.sharedMemberIndexes).toEqual(new Set([0]));
  });

  it('excludes a closed member from the union', () => {
    const result = resolveSharedTimelineWindow([
      makeTimeline({ timelineStartMinutes: 540, timelineEndMinutes: 1080 }),
      makeTimeline({
        selectedDayClosed: true,
        timelineStartMinutes: 0,
        timelineEndMinutes: 0,
      }),
    ]);

    expect(result.sharedMemberIndexes).toEqual(new Set([0]));
    expect(result.sharedStartMinutes).toBe(540);
    expect(result.sharedEndMinutes).toBe(1080);
  });

  it('collapses to a single-member group when only one member is eligible (non-regression)', () => {
    const result = resolveSharedTimelineWindow([makeTimeline()]);
    expect(result.sharedMemberIndexes).toEqual(new Set([0]));
    expect(result.sharedStartMinutes).toBe(540);
    expect(result.sharedEndMinutes).toBe(1080);
  });

  it('returns an empty shared group when every member opts out', () => {
    const result = resolveSharedTimelineWindow([
      makeTimeline({ isOverriddenByOpening: true }),
      makeTimeline({ selectedDayClosed: true, timelineStartMinutes: 0, timelineEndMinutes: 0 }),
    ]);
    expect(result.sharedMemberIndexes.size).toBe(0);
  });
});

describe('applySharedTimelineWindow', () => {
  it('repositions timelineStartMinutes/timelineEndMinutes/slotCount, leaving events untouched', () => {
    const events = [{ id: 'e1' }] as unknown as TimelineDayData['events'];
    const member = makeTimeline({
      timelineStartMinutes: 540,
      timelineEndMinutes: 1080,
      slotCount: 18,
      events,
    });

    const result = applySharedTimelineWindow(member, 480, 1080, 30);

    expect(result.timelineStartMinutes).toBe(480);
    expect(result.timelineEndMinutes).toBe(1080);
    expect(result.slotCount).toBe(20);
    expect(result.events).toBe(events);
  });

  // The tests above only assert the TimelineDayData shape changes — this confirms the actual
  // rendered consequence: buildBlockStyle (the function every real block renderer calls) computes
  // a different `top` for the same event once repositioned against the shared range, matching TD44
  // Story 3's own AC ("every block's vertical position still correctly reflects its real time").
  it('repositions a shared-group member event against the union range, changing its rendered top', () => {
    const member = makeTimeline({ timelineStartMinutes: 540, timelineEndMinutes: 1080 }); // 09:00-18:00
    const shared = applySharedTimelineWindow(member, 480, 1080, 30); // union widened to 08:00

    // A 09:00-09:30 event (540-570 minutes).
    const originalStyle = buildBlockStyle(
      540,
      570,
      member.timelineStartMinutes,
      member.timelineEndMinutes,
      30,
      48,
    );
    const sharedStyle = buildBlockStyle(
      540,
      570,
      shared.timelineStartMinutes,
      shared.timelineEndMinutes,
      30,
      48,
    );

    // Same event, same slotHeight — but the shared range starts 60 minutes earlier, so the
    // rendered `top` must shift down by exactly 2 slots' worth of pixels (60min / 30min * 48px).
    expect(originalStyle.top).toBe('0px');
    expect(sharedStyle.top).toBe('96px');
    // Height (the event's own duration) is unaffected by which range it's positioned against.
    expect(sharedStyle.height).toBe(originalStyle.height);
  });

  it("leaves an opt-out member's own event position unaffected — it never goes through applySharedTimelineWindow", () => {
    // An opening-overridden member (e.g. a 2am exceptional opening) keeps its own
    // timelineStartMinutes/timelineEndMinutes untouched — resolveSharedTimelineWindow already
    // excludes it from sharedMemberIndexes, so callers (schedule-resource-columns.ts,
    // schedule-page-timeline-derived.ts) never call applySharedTimelineWindow on it at all.
    const optOut = makeTimeline({
      timelineStartMinutes: 120,
      timelineEndMinutes: 240,
      isOverriddenByOpening: true,
    });

    const style = buildBlockStyle(
      120,
      150,
      optOut.timelineStartMinutes,
      optOut.timelineEndMinutes,
      30,
      48,
    );

    expect(style.top).toBe('0px');
  });
});

describe('rendersOwnLabelColumn', () => {
  it('renders true for a member not in the shared group (opt-out)', () => {
    expect(rendersOwnLabelColumn(1, new Set([0, 2]))).toBe(true);
  });

  it('renders true only for the lowest-index shared member', () => {
    const sharedMemberIndexes = new Set([1, 2, 3]);
    expect(rendersOwnLabelColumn(1, sharedMemberIndexes)).toBe(true);
    expect(rendersOwnLabelColumn(2, sharedMemberIndexes)).toBe(false);
    expect(rendersOwnLabelColumn(3, sharedMemberIndexes)).toBe(false);
  });
});
