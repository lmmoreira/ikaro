import { describe, expect, it } from 'vitest';
import type { TimelineDayData } from '@/features/booking/schedule/schedule-timeline';
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
