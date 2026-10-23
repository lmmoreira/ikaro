import type {
  HotsiteModulePresentation,
  HotsiteOverlayDirection,
  HotsiteSectionContentWidth,
  HotsiteSectionMinHeight,
  HotsiteSectionOverlay,
  HotsiteSectionPadding,
} from '@ikaro/types';
import type React from 'react';

// Pure translation of a module's validated `presentation` into CSS. Every function returns
// `undefined` for an omitted field, so a module without `presentation` keeps exactly the markup
// and styles it had before the field existed (HotsiteSectionShell composes these over the
// module's own legacy choices).

// The inner content container of a flow section. `standard` is today's `max-w-7xl`.
const CONTENT_WIDTH_CLASS: Readonly<Record<HotsiteSectionContentWidth, string>> = {
  narrow: 'max-w-3xl',
  standard: 'max-w-7xl',
  wide: 'max-w-[90rem]',
  full: 'max-w-none',
};

// A hero-family text block (Hero, Booking CTA, Lead Form centered variants) already has its own
// narrow text column; `standard` keeps that column, the others replace it.
const TEXT_COLUMN_WIDTH_CLASS: Readonly<Record<HotsiteSectionContentWidth, string | undefined>> = {
  narrow: 'max-w-xl',
  standard: undefined,
  wide: 'max-w-5xl',
  full: 'max-w-none',
};

// A hero-family left-aligned grid container; `standard` is today's `max-w-7xl`.
const GRID_WIDTH_CLASS: Readonly<Record<HotsiteSectionContentWidth, string>> = {
  narrow: 'max-w-4xl',
  standard: 'max-w-7xl',
  wide: 'max-w-[90rem]',
  full: 'max-w-none',
};

const MIN_HEIGHT: Readonly<Record<HotsiteSectionMinHeight, string>> = {
  auto: 'auto',
  sm: '20rem',
  md: '32rem',
  lg: '44rem',
  viewport: '100vh',
};

// Vertical padding only; the horizontal gutter (1.5rem / px-6) is never overridden.
const PADDING_BLOCK: Readonly<Record<HotsiteSectionPadding, string>> = {
  none: '0',
  compact: 'calc(var(--ba-section-py) / 2)',
  comfortable: 'var(--ba-section-py)',
  spacious: 'calc(var(--ba-section-py) * 1.5)',
};

const OVERLAY_DIRECTION: Readonly<Record<HotsiteOverlayDirection, string>> = {
  'to-right': 'to right',
  'to-left': 'to left',
  'to-bottom': 'to bottom',
  'to-top': 'to top',
};

// The minimum scrim a section gets when it has a photo behind its text but no explicit overlay:
// text over a photo cannot be contrast-checked, so the renderer guarantees a floor instead.
export const MINIMUM_SCRIM_COLOR = 'rgba(0, 0, 0, 0.35)';

export function contentWidthClass(width: HotsiteSectionContentWidth | undefined): string {
  return CONTENT_WIDTH_CLASS[width ?? 'standard'];
}

export function textColumnWidthClass(
  width: HotsiteSectionContentWidth | undefined,
  fallback: string,
): string {
  return (width && TEXT_COLUMN_WIDTH_CLASS[width]) ?? fallback;
}

export function gridWidthClass(width: HotsiteSectionContentWidth | undefined): string {
  return GRID_WIDTH_CLASS[width ?? 'standard'];
}

export function resolveMinHeight(
  minHeight: HotsiteSectionMinHeight | undefined,
): string | undefined {
  return minHeight ? MIN_HEIGHT[minHeight] : undefined;
}

export function resolvePaddingBlock(
  padding: HotsiteSectionPadding | undefined,
): string | undefined {
  return padding ? PADDING_BLOCK[padding] : undefined;
}

function hexToRgba(hex: string, opacity: number): string {
  const channel = (start: number): number => Number.parseInt(hex.slice(start, start + 2), 16);
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${opacity})`;
}

// The CSS background of the overlay layer, or undefined when the section has no explicit overlay.
export function resolveOverlayBackground(
  overlay: HotsiteSectionOverlay | undefined,
): string | undefined {
  if (!overlay || overlay.type === 'none') return undefined;
  if (overlay.type === 'solid') return hexToRgba(overlay.color, overlay.opacity);
  return `linear-gradient(${OVERLAY_DIRECTION[overlay.direction]}, ${hexToRgba(
    overlay.fromColor,
    overlay.fromOpacity,
  )}, ${hexToRgba(overlay.toColor, overlay.toOpacity)})`;
}

// The image behind a section that has none of its own. A null or empty path is "no image".
export function resolvePresentationBackgroundImage(
  presentation: HotsiteModulePresentation | undefined,
): { readonly url: string; readonly objectPosition: string } | null {
  const background = presentation?.background;
  if (!background?.imageUrl) return null;
  return { url: background.imageUrl, objectPosition: `${background.position ?? 'center'} center` };
}

// The overlay layer's background for a section. An explicit overlay is used as written. A section
// that opted into `presentation` and has a photo behind its text but no overlay (absent or
// 'none') gets the minimum scrim. A module without `presentation` is never given one, so existing
// photo sections render exactly as before.
export function resolveSectionScrim(
  presentation: HotsiteModulePresentation | undefined,
  hasBackgroundImage: boolean,
): React.CSSProperties['background'] | undefined {
  if (!presentation) return undefined;
  const explicit = resolveOverlayBackground(presentation.overlay);
  if (explicit) return explicit;
  return hasBackgroundImage ? MINIMUM_SCRIM_COLOR : undefined;
}
