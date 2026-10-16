import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLOATING_FILTER_CORNER,
  FLOATING_FILTER_CORNERS,
  dockClassName,
  isFloatingFilterCorner,
  nearestCorner,
  popoverClassName,
} from './floating-filter-corner';

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 780 };

describe('nearestCorner', () => {
  it.each([
    [{ x: 100, y: 100 }, 'top-left'],
    [{ x: 1300, y: 100 }, 'top-right'],
    [{ x: 100, y: 800 }, 'bottom-left'],
    [{ x: 1300, y: 800 }, 'bottom-right'],
  ])('picks the corner of the quadrant on desktop for %j', (point, expected) => {
    expect(nearestCorner(point, DESKTOP)).toBe(expected);
  });

  it.each([
    [{ x: 40, y: 60 }, 'top-left'],
    [{ x: 350, y: 60 }, 'top-right'],
    [{ x: 40, y: 700 }, 'bottom-left'],
    [{ x: 350, y: 700 }, 'bottom-right'],
  ])('picks the corner of the quadrant on mobile for %j', (point, expected) => {
    expect(nearestCorner(point, MOBILE)).toBe(expected);
  });

  it('sends a point exactly on an axis to the bottom-right side', () => {
    expect(nearestCorner({ x: 720, y: 450 }, DESKTOP)).toBe('bottom-right');
    expect(nearestCorner({ x: 720, y: 100 }, DESKTOP)).toBe('top-right');
    expect(nearestCorner({ x: 100, y: 450 }, DESKTOP)).toBe('bottom-left');
  });
});

describe('isFloatingFilterCorner', () => {
  it('accepts the four corners and rejects anything else', () => {
    for (const corner of FLOATING_FILTER_CORNERS) expect(isFloatingFilterCorner(corner)).toBe(true);
    expect(isFloatingFilterCorner('center')).toBe(false);
    expect(isFloatingFilterCorner(undefined)).toBe(false);
    expect(isFloatingFilterCorner(3)).toBe(false);
  });

  it('defaults to the bottom-right corner, where the filters sit today', () => {
    expect(DEFAULT_FLOATING_FILTER_CORNER).toBe('bottom-right');
  });
});

describe('dockClassName', () => {
  it('keeps the existing bottom-right offsets for the default corner', () => {
    expect(dockClassName('bottom-right')).toContain('bottom-24 right-4');
    expect(dockClassName('bottom-right')).toContain('lg:bottom-6 lg:right-6');
  });

  it('clears the bottom navigation on the bottom corners and the topbar on the top corners', () => {
    expect(dockClassName('bottom-left')).toContain('bottom-24');
    expect(dockClassName('top-left')).toContain('top-[4.75rem]');
    expect(dockClassName('top-right')).toContain('top-[4.75rem]');
  });

  it('starts the left corners after the sidebar on desktop', () => {
    expect(dockClassName('bottom-left')).toContain('lg:left-[calc(15rem+1.5rem)]');
    expect(dockClassName('top-left')).toContain('lg:left-[calc(15rem+1.5rem)]');
  });

  it('reverses the stack in the top corners so the first filter stays nearest the corner', () => {
    expect(dockClassName('top-left')).toContain('flex-col-reverse');
    expect(dockClassName('top-right')).toContain('flex-col-reverse');
    expect(dockClassName('bottom-left')).not.toContain('flex-col-reverse');
    expect(dockClassName('bottom-right')).not.toContain('flex-col-reverse');
  });
});

describe('popoverClassName', () => {
  it('opens upward from a bottom corner and downward from a top corner', () => {
    expect(popoverClassName('bottom-right')).toContain('bottom-full');
    expect(popoverClassName('bottom-left')).toContain('bottom-full');
    expect(popoverClassName('top-right')).toContain('top-full');
    expect(popoverClassName('top-left')).toContain('top-full');
  });

  it('aligns to the right edge of the pill in a right corner and the left edge in a left one', () => {
    expect(popoverClassName('bottom-right')).toContain('right-0');
    expect(popoverClassName('top-right')).toContain('right-0');
    expect(popoverClassName('bottom-left')).toContain('left-0');
    expect(popoverClassName('top-left')).toContain('left-0');
  });
});
