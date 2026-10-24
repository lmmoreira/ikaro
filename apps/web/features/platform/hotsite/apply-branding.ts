import type {
  HotsiteBrandingResponse,
  HotsiteSectionOverlay,
  HotsiteSectionSurface,
} from '@ikaro/types';
import type React from 'react';

import { FONT_MAP } from './font-config';

const BORDER_RADIUS = { sharp: '0px', rounded: '8px', pill: '9999px', soft: '24px' };
const SECTION_PY = { compact: '3rem', comfortable: '5rem', spacious: '8rem' };
const SHADOW = {
  none: 'none',
  subtle: '0 1px 3px rgba(0,0,0,0.10)',
  strong: '0 4px 16px rgba(0,0,0,0.20)',
};

// Derived button tokens: module components consume --ba-btn-bg/text/border/hover-bg directly via
// inline styles and Tailwind arbitrary values so they never need to branch on the
// --ba-btn-variant string value in CSS.
const BTN_STYLES = {
  filled: { bg: 'var(--ba-primary)', text: '#ffffff', border: 'var(--ba-primary)' },
  outline: { bg: 'transparent', text: 'var(--ba-primary)', border: 'var(--ba-primary)' },
  ghost: { bg: 'transparent', text: 'var(--ba-primary)', border: 'transparent' },
} as const;

interface ButtonTokens {
  bg: string;
  text: string;
  border: string;
  hoverBg: string;
}

// buttonBackgroundColor: 'filled' -> permanent bg+border override; 'outline'/'ghost' -> hover-fill
// (--ba-btn-hover-bg) only, resting bg stays transparent. buttonTextColor: overrides text for all
// styles, plus border for 'outline' (border mirrors text there, same as the primaryColor default).
function deriveButtonTokens(branding: HotsiteBrandingResponse): ButtonTokens {
  const base = BTN_STYLES[branding.buttonStyle] ?? BTN_STYLES.filled;
  const { buttonBackgroundColor, buttonTextColor } = branding;
  const isFilled = branding.buttonStyle === 'filled';
  const isOutline = branding.buttonStyle === 'outline';

  const bg = isFilled && buttonBackgroundColor ? buttonBackgroundColor : base.bg;
  const border =
    isFilled && buttonBackgroundColor
      ? buttonBackgroundColor
      : (isOutline && buttonTextColor) || base.border;
  const text = buttonTextColor ?? base.text;
  const hoverBg = isFilled ? bg : (buttonBackgroundColor ?? 'transparent');

  return { bg, text, border, hoverBg };
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  return [
    Number.parseInt(normalized.substring(0, 2), 16),
    Number.parseInt(normalized.substring(2, 4), 16),
    Number.parseInt(normalized.substring(4, 6), 16),
  ];
}

function linearizeChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

// WCAG 2.1 relative luminance: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

// The effective background color of the hero section — either the primary brand color (default)
// or the page background color when heroBgStyle === 'background'.
function deriveHeroBg(branding: HotsiteBrandingResponse): string {
  return branding.heroBgStyle === 'background' ? branding.backgroundColor : branding.primaryColor;
}

// Pick whichever of backgroundColor/textColor contrasts better against the hero background,
// so text is always legible regardless of heroBgStyle.
function deriveHeroTextColor(branding: HotsiteBrandingResponse): string {
  const heroBg = deriveHeroBg(branding);
  const { backgroundColor, textColor } = branding;
  return contrastRatio(heroBg, backgroundColor) >= contrastRatio(heroBg, textColor)
    ? backgroundColor
    : textColor;
}

// WCAG AA for normal-size text.
const MIN_TEXT_CONTRAST = 4.5;

function channelToHex(channel: number): string {
  return Math.round(channel).toString(16).padStart(2, '0');
}

// Linear blend in sRGB: `amount` of `towards` over `base` — deterministic hex, no color-mix().
function mixHex(base: string, towards: string, amount: number): string {
  const [br, bg, bb] = hexToRgb(base);
  const [tr, tg, tb] = hexToRgb(towards);
  const mix = (from: number, to: number): string => channelToHex(from + (to - from) * amount);
  return `#${mix(br, tr)}${mix(bg, tg)}${mix(bb, tb)}`.toUpperCase();
}

// The better-contrasting of the candidates against `surfaceColor`; if none reaches AA, plain black
// or white, whichever is better — max(contrast vs black, contrast vs white) is always >= 4.58, so
// the result always meets AA.
function pickReadableColor(surfaceColor: string, candidates: readonly string[]): string {
  const best = [...candidates].sort(
    (a, b) => contrastRatio(surfaceColor, b) - contrastRatio(surfaceColor, a),
  )[0];
  if (contrastRatio(surfaceColor, best) >= MIN_TEXT_CONTRAST) return best;
  return contrastRatio(surfaceColor, '#000000') >= contrastRatio(surfaceColor, '#FFFFFF')
    ? '#000000'
    : '#FFFFFF';
}

export type SectionTokens = Record<
  '--ba-section-bg' | '--ba-section-text' | '--ba-section-card-bg' | '--ba-section-divider',
  string
>;

// Scoped tokens for one section whose `presentation.surface` is set. The caller puts them on
// the section element itself — never on the page root — so they cannot leak into a sibling section
// and the global --ba-* tokens applyBranding() emits stay exactly as they were. A surface colour is
// always known (a branding colour, or the module's own `customColor`), so text, card and divider
// are derived from it and always meet AA (text >= 4.5:1 on the surface, and on the card);
// nothing is rejected. Text over a photo cannot be measured and is handled by the renderer's scrim.
export function deriveSectionTokens(
  branding: HotsiteBrandingResponse,
  surface: HotsiteSectionSurface,
  customColor?: string,
): SectionTokens {
  const bg = {
    background: branding.backgroundColor,
    secondary: branding.secondaryColor,
    primary: branding.primaryColor,
    custom: customColor ?? branding.backgroundColor,
  }[surface];
  const text = pickReadableColor(bg, [branding.backgroundColor, branding.textColor]);
  const tintedCard = mixHex(bg, text, 0.08);
  return {
    '--ba-section-bg': bg,
    '--ba-section-text': text,
    // The tint is only used while text still reads on it; otherwise the card keeps the surface.
    '--ba-section-card-bg': contrastRatio(tintedCard, text) >= MIN_TEXT_CONTRAST ? tintedCard : bg,
    '--ba-section-divider': mixHex(bg, text, 0.25),
  };
}

type ContentAnchor = 'left' | 'center' | 'right' | 'top' | 'bottom';

function overlayAtContent(
  overlay: HotsiteSectionOverlay,
  x: ContentAnchor,
  y: ContentAnchor,
): { readonly color: string; readonly opacity: number } | null {
  if (overlay.type === 'none') return null;
  if (overlay.type === 'solid') return overlay;
  const position = overlay.direction === 'to-right' || overlay.direction === 'to-left' ? x : y;
  const fraction =
    position === 'center'
      ? 0.5
      : overlay.direction === 'to-right'
        ? position === 'right'
          ? 1
          : 0
        : overlay.direction === 'to-left'
          ? position === 'left'
            ? 1
            : 0
          : overlay.direction === 'to-bottom'
            ? position === 'bottom'
              ? 1
              : 0
            : position === 'top'
              ? 1
              : 0;
  return {
    color: mixHex(overlay.fromColor, overlay.toColor, fraction),
    opacity: overlay.fromOpacity + (overlay.toOpacity - overlay.fromOpacity) * fraction,
  };
}

export function deriveOverlayTextTokens(
  branding: HotsiteBrandingResponse,
  surface: HotsiteSectionSurface,
  overlay: HotsiteSectionOverlay,
  customColor?: string,
  x: ContentAnchor = 'center',
  y: ContentAnchor = 'center',
): SectionTokens {
  const base = deriveSectionTokens(branding, surface, customColor);
  const textSide = overlayAtContent(overlay, x, y);
  if (!textSide) return base;
  const effective = mixHex(base['--ba-section-bg'], textSide.color, textSide.opacity);
  const readable = deriveSectionTokens(branding, 'custom', effective);
  return { ...readable, '--ba-section-bg': base['--ba-section-bg'] };
}

// CSS value for the divider rendered between sections.
function deriveDivider(branding: HotsiteBrandingResponse): string {
  if (branding.dividerStyle === 'gradient') {
    return `linear-gradient(90deg, transparent, ${branding.primaryColor}, transparent)`;
  }
  if (branding.dividerStyle === 'solid') {
    return branding.secondaryColor;
  }
  return 'none';
}

export function applyBranding(
  branding: HotsiteBrandingResponse,
): React.CSSProperties & Record<`--ba-${string}`, string> {
  const btn = deriveButtonTokens(branding);
  const secondaryTokens = deriveSectionTokens(branding, 'secondary');
  const secondaryText =
    contrastRatio(branding.secondaryColor, branding.textColor) >= MIN_TEXT_CONTRAST
      ? branding.textColor
      : secondaryTokens['--ba-section-text'];
  return {
    '--ba-primary': branding.primaryColor,
    '--ba-secondary': branding.secondaryColor,
    '--ba-background': branding.backgroundColor,
    '--ba-text': branding.textColor,
    '--ba-heading-font': FONT_MAP[branding.headingFontFamily] ?? FONT_MAP['Inter'],
    '--ba-body-font': FONT_MAP[branding.bodyFontFamily] ?? FONT_MAP['Inter'],
    '--ba-radius': BORDER_RADIUS[branding.borderRadius],
    '--ba-btn-radius': BORDER_RADIUS[branding.buttonRadius ?? branding.borderRadius],
    '--ba-heading-weight': String(branding.headingWeight ?? 700),
    '--ba-heading-transform': branding.headingTransform ?? 'none',
    '--ba-section-py': SECTION_PY[branding.spacing],
    '--ba-shadow': SHADOW[branding.shadowStyle],
    '--ba-btn-variant': branding.buttonStyle,
    '--ba-btn-bg': btn.bg,
    '--ba-btn-text': btn.text,
    '--ba-btn-border': btn.border,
    '--ba-btn-hover-bg': btn.hoverBg,
    '--ba-hero-bg': deriveHeroBg(branding),
    '--ba-hero-text': deriveHeroTextColor(branding),
    '--ba-divider': deriveDivider(branding),
    '--ba-secondary-text': secondaryText,
    '--ba-secondary-divider': secondaryTokens['--ba-section-divider'],
    '--ba-secondary-accent':
      contrastRatio(branding.secondaryColor, branding.primaryColor) >= MIN_TEXT_CONTRAST
        ? branding.primaryColor
        : secondaryText,
  };
}
