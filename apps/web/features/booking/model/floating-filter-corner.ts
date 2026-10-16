// The pure part of the movable floating filter (M23-S50): which corner a point is nearest to, and
// every class the dock and the popover derive from the corner. Nothing here touches the DOM, so
// the hook, the dock and the menus share one answer instead of each doing their own maths.
export const FLOATING_FILTER_CORNERS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;
export type FloatingFilterCorner = (typeof FLOATING_FILTER_CORNERS)[number];

// Where the filters sit today, so nobody who never drags sees anything move.
export const DEFAULT_FLOATING_FILTER_CORNER: FloatingFilterCorner = 'bottom-right';

const CORNERS: ReadonlySet<unknown> = new Set(FLOATING_FILTER_CORNERS);

export function isFloatingFilterCorner(value: unknown): value is FloatingFilterCorner {
  return CORNERS.has(value);
}

export interface ViewportPoint {
  readonly x: number;
  readonly y: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

// A point exactly on an axis goes to the bottom-right side, the same side as the default.
export function nearestCorner(point: ViewportPoint, viewport: ViewportSize): FloatingFilterCorner {
  const vertical = point.y < viewport.height / 2 ? 'top' : 'bottom';
  const horizontal = point.x < viewport.width / 2 ? 'left' : 'right';
  return `${vertical}-${horizontal}`;
}

// Full class strings, never assembled from parts, so Tailwind sees every one of them.
// Bottom corners keep the offset that clears the mobile bottom navigation; the top corners sit
// below the dashboard topbar; on lg the left corners start after the 15rem sidebar plus the gutter.
const DOCK_CLASS_NAME: Readonly<Record<FloatingFilterCorner, string>> = {
  'bottom-right': 'bottom-24 right-4 flex-col items-end lg:bottom-6 lg:right-6',
  'bottom-left': 'bottom-24 left-4 flex-col items-start lg:bottom-6 lg:left-[calc(15rem+1.5rem)]',
  'top-right': 'top-[4.75rem] right-4 flex-col-reverse items-end lg:right-6',
  'top-left': 'top-[4.75rem] left-4 flex-col-reverse items-start lg:left-[calc(15rem+1.5rem)]',
};

// The popover opens toward the centre of the screen: upward from a bottom corner, downward from
// a top one, and aligned to the edge of the pill that is nearest the screen edge.
const POPOVER_CLASS_NAME: Readonly<Record<FloatingFilterCorner, string>> = {
  'bottom-right': 'bottom-full right-0 mb-3',
  'bottom-left': 'bottom-full left-0 mb-3',
  'top-right': 'top-full right-0 mt-3',
  'top-left': 'top-full left-0 mt-3',
};

export function dockClassName(corner: FloatingFilterCorner): string {
  return DOCK_CLASS_NAME[corner];
}

export function popoverClassName(corner: FloatingFilterCorner): string {
  return POPOVER_CLASS_NAME[corner];
}
