import { describe, expect, it } from 'vitest';
import type { ServiceLegItem } from '@ikaro/types';
import { legsSpanMinutes } from './legs-span';

const leg = (legIndex: number, durationMinutes: number, gap?: number): ServiceLegItem => ({
  legIndex,
  name: `Etapa ${legIndex}`,
  durationMinutes,
  resourceRequirements: [],
  transitionGapAfterMinutes: gap,
});

describe('legsSpanMinutes', () => {
  it('adds every duration and the gaps between legs', () => {
    expect(legsSpanMinutes([leg(0, 20, 10), leg(1, 50, 5), leg(2, 20, 0)])).toBe(105);
  });

  it("never counts the last leg's gap", () => {
    expect(legsSpanMinutes([leg(0, 20, 10), leg(1, 50, 99)])).toBe(80);
  });

  it('treats a missing gap as zero and an empty list as zero', () => {
    expect(legsSpanMinutes([leg(0, 20), leg(1, 30)])).toBe(50);
    expect(legsSpanMinutes([])).toBe(0);
  });
});
