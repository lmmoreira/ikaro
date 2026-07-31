import type React from 'react';

// Shared section-heading font — combine with a module-specific `color`.
export const sectionHeadingFont: React.CSSProperties = {
  fontFamily: 'var(--ba-heading-font)',
};

// Content-block anchor helpers, shared by HeroModule and BookingCtaModule (M18-S05) — both
// modules have the same `centered`/`left-aligned` shape and the same anchor semantics: X only
// has a rendering effect on the `centered` variant (the `left-aligned` variant's text column
// position is structural, not free-floating), Y applies to both variants. Defaults ('center' for
// both) are a no-op against each module's pre-M18-S05 hardcoded centering.
export type ContentPositionX = 'left' | 'center' | 'right';
export type ContentPositionY = 'top' | 'center' | 'bottom';

export function contentJustifyClass(x: ContentPositionX = 'center'): string {
  if (x === 'left') return 'justify-start';
  if (x === 'right') return 'justify-end';
  return 'justify-center';
}

export function contentItemsClass(y: ContentPositionY = 'center'): string {
  if (y === 'top') return 'items-start';
  if (y === 'bottom') return 'items-end';
  return 'items-center';
}

export function contentTextAlignClass(x: ContentPositionX = 'center'): string {
  if (x === 'left') return 'text-left';
  if (x === 'right') return 'text-right';
  return 'text-center';
}
