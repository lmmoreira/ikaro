'use client';

import { useEffect, useRef, type RefObject } from 'react';

// TD44 Story 4 — auto-scrolls the timeline once, on initial load/date change, to bring "now" into
// view instead of always starting at the active window's opening time. Resolves purely from the
// same top/height math buildBlockStyle already uses, so it needs no new coordinate system.

const LOOKBACK_MINUTES = 60;

interface NowMarkerTimeline {
  readonly timelineStartMinutes: number;
  readonly timelineEndMinutes: number;
  readonly slotHeight: number;
}

// Clamps "now" into the active window first, then backs off by LOOKBACK_MINUTES (also clamped) —
// this guarantees the returned pixel offset always lands inside the rendered slot range, even when
// "now" falls outside today's active hours (before opening or after closing).
export function resolveNowMarkerTopPx(
  timeline: NowMarkerTimeline,
  slotGranularityMinutes: number,
  nowMinutes: number,
): number {
  const { timelineStartMinutes, timelineEndMinutes, slotHeight } = timeline;
  const clampedNow = Math.min(Math.max(nowMinutes, timelineStartMinutes), timelineEndMinutes);
  const targetMinutes = Math.max(timelineStartMinutes, clampedNow - LOOKBACK_MINUTES);
  return ((targetMinutes - timelineStartMinutes) / slotGranularityMinutes) * slotHeight;
}

// Fires scrollIntoView on the marker element once per (dateKey, DOM node) pair — never on a
// same-key, same-node re-render from data refetch/polling, so a user's own manual scroll mid-
// session is never fought. `enabled` gates whether the viewed date/week actually includes "now" at
// all (a past/future date is a no-op, same as today's exact behavior).
//
// Guarding on dateKey alone is not enough: the caller (ScheduleMainView) keeps one hook instance
// across every branch it renders (single timeline / resource-columns board / week view), and
// switching between them — e.g. Week → Day view with the date unchanged — unmounts the old
// marker <div> and mounts a brand new one. A dateKey-only guard would see "already fired for this
// key" and skip the new node's scroll entirely, leaving the page scrolled to wherever the previous
// view left it. Tracking the scrolled-to node's own identity alongside the key fixes this: a same-key
// render that reuses the same node is still a no-op, but a same-key render with a *different* node
// (or a genuinely new key) re-fires.
//
// Deliberately has no dependency array: if the marker hasn't mounted yet on the render where
// `enabled`/`dateKey` first qualify (e.g. data still loading, or the day starts in its closed empty
// state before real hours resolve), it retries on the next render instead of silently missing the
// scroll — the guard refs keep this a no-op once it has actually fired for the current (key, node).
export function useScrollToNowOnce(
  enabled: boolean,
  dateKey: string,
): RefObject<HTMLDivElement | null> {
  const markerRef = useRef<HTMLDivElement | null>(null);
  const scrolledForKeyRef = useRef<string | null>(null);
  const scrolledNodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = markerRef.current;
    if (!enabled || !node) {
      return;
    }
    const alreadyScrolled =
      scrolledForKeyRef.current === dateKey && scrolledNodeRef.current === node;
    if (alreadyScrolled) {
      return;
    }
    scrolledForKeyRef.current = dateKey;
    scrolledNodeRef.current = node;
    // block: 'center', not 'start' — the marker is a zero-height div; 'start' lands its edge
    // exactly on the viewport boundary, a fragile geometric case for an intersection check
    // (observed live: Playwright's toBeInViewport() intermittently reported a 0 ratio for an
    // element sitting right at that edge). 'center' clears the boundary entirely and also better
    // matches the "show context around now" intent than pinning it to the very top.
    node.scrollIntoView({ block: 'center', behavior: 'auto' });
  });

  return markerRef;
}
