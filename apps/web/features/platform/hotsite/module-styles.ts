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

export interface ContentStageClasses {
  readonly sectionClassName: string;
  readonly stageClassName: string;
  readonly wrapperClassName: string;
  readonly justifyClass: string;
}

// Centered-variant class composition, shared by HeroModule and BookingCtaModule (M18-S05 —
// centralized here per CodeRabbit review, PR #295, since both modules built the same
// section/stage/wrapper composition independently from the same primitives above). Utility class
// order within a single className string doesn't affect Tailwind's output (each class maps to an
// independent CSS rule), so `itemsClass` is always appended after `sectionBaseClasses` regardless
// of where it originally sat in each module's own class string — purely cosmetic, not a behavior
// change. `sectionBaseClasses` carries each module's own min-height/padding/breakpoint classes;
// `wrapperMaxWidthClasses` carries each module's own wrapper max-width (plus `py-16` for Hero,
// which BookingCta's wrapper doesn't have).
export function buildContentStageClasses(
  contentPositionX: ContentPositionX | undefined,
  contentPositionY: ContentPositionY | undefined,
  sectionBaseClasses: string,
  wrapperMaxWidthClasses: string,
): ContentStageClasses {
  const justifyClass = contentJustifyClass(contentPositionX);
  const itemsClass = contentItemsClass(contentPositionY);
  const textAlignClass = contentTextAlignClass(contentPositionX);

  return {
    justifyClass,
    sectionClassName: `${sectionBaseClasses} ${itemsClass}`,
    stageClassName: `relative z-10 flex w-full max-w-7xl mx-auto ${justifyClass}`,
    wrapperClassName: `${wrapperMaxWidthClasses} ${textAlignClass}`,
  };
}
