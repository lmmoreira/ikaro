import type { HotsiteBrandingResponse } from '@ikaro/types';
import { contrastRatio } from './apply-branding';

export interface SectionTint {
  readonly background: string;
  readonly text: string;
}

function mix(base: string, tint: string, fraction: number): string {
  const channel = (hex: string, offset: number): number =>
    Number.parseInt(hex.slice(offset, offset + 2), 16);
  const blended = [1, 3, 5].map((offset) =>
    Math.round(channel(base, offset) * (1 - fraction) + channel(tint, offset) * fraction)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${blended.join('')}`.toUpperCase();
}

function readableText(background: string, preferred: string): string {
  if (contrastRatio(background, preferred) >= 4.5) return preferred;
  return contrastRatio(background, '#000000') > contrastRatio(background, '#FFFFFF')
    ? '#000000'
    : '#FFFFFF';
}

// The three card/tile colours are computed from the actual section surface, then checked against
// the actual rendered background. A CSS-only mix cannot make that contrast guarantee.
export function sectionTints(
  branding: HotsiteBrandingResponse,
  surface: string,
): readonly [SectionTint, SectionTint, SectionTint] {
  return [branding.primaryColor, branding.secondaryColor, branding.textColor].map((color) => {
    const background = mix(surface, color, 0.18);
    return { background, text: readableText(background, branding.textColor) };
  }) as [SectionTint, SectionTint, SectionTint];
}
