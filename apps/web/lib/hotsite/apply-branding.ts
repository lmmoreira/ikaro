import type { HotsiteBrandingResponse } from '@beloauto/types';
import type React from 'react';

import { FONT_MAP } from './font-config';

const BORDER_RADIUS = { sharp: '0px', rounded: '8px', pill: '9999px' };
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

function contrastRatio(hexA: string, hexB: string): number {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

// The hero section's solid background is --ba-primary (see HeroModule.tsx) when there is no
// background image. Pick whichever of backgroundColor/textColor contrasts better against it,
// rather than always assuming backgroundColor is readable on top of primaryColor.
function deriveHeroTextColor(branding: HotsiteBrandingResponse): string {
  const { primaryColor, backgroundColor, textColor } = branding;
  return contrastRatio(primaryColor, backgroundColor) >= contrastRatio(primaryColor, textColor)
    ? backgroundColor
    : textColor;
}

export function applyBranding(
  branding: HotsiteBrandingResponse,
): React.CSSProperties & Record<`--ba-${string}`, string> {
  const btn = deriveButtonTokens(branding);
  return {
    '--ba-primary': branding.primaryColor,
    '--ba-secondary': branding.secondaryColor,
    '--ba-background': branding.backgroundColor,
    '--ba-text': branding.textColor,
    '--ba-heading-font': FONT_MAP[branding.headingFontFamily] ?? FONT_MAP['Inter'],
    '--ba-body-font': FONT_MAP[branding.bodyFontFamily] ?? FONT_MAP['Inter'],
    '--ba-radius': BORDER_RADIUS[branding.borderRadius],
    '--ba-section-py': SECTION_PY[branding.spacing],
    '--ba-shadow': SHADOW[branding.shadowStyle],
    '--ba-btn-variant': branding.buttonStyle,
    '--ba-btn-bg': btn.bg,
    '--ba-btn-text': btn.text,
    '--ba-btn-border': btn.border,
    '--ba-btn-hover-bg': btn.hoverBg,
    '--ba-hero-text': deriveHeroTextColor(branding),
  };
}
