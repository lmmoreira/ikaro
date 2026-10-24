import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { HotsiteBrandingResponse } from '@ikaro/types';
import { describe, expect, it } from 'vitest';
import { applyBranding, contrastRatio } from './apply-branding';
import { parseManifestJson } from './manifest-schema';
import { buildHotsiteModuleRenderPlan } from './page-model';

const FIXTURE_DIR = fileURLToPath(
  new URL('../../../../../journeys/manager/prototypes/hotsite/hotsite-impl/', import.meta.url),
);
const FILES = readdirSync(FIXTURE_DIR)
  .filter((file) => /^manifesto-(?!v2-layout-proposal).+\.json$/.test(file))
  .sort();

function headerTokens(branding: HotsiteBrandingResponse): Record<string, string> {
  return applyBranding(branding) as unknown as Record<string, string>;
}

describe('top bar, navigation and footer tokens (G14)', () => {
  const sameColour: HotsiteBrandingResponse = {
    primaryColor: '#2F6F4F',
    secondaryColor: '#26372F',
    backgroundColor: '#F6F1E7',
    textColor: '#26372F',
    headingFontFamily: 'Inter',
    bodyFontFamily: 'Inter',
    logoUrl: '',
    borderRadius: 'sharp',
    buttonStyle: 'filled',
    spacing: 'comfortable',
    shadowStyle: 'none',
  };

  it('stays readable when textColor equals secondaryColor', () => {
    const tokens = headerTokens(sameColour);
    expect(
      contrastRatio(sameColour.secondaryColor, tokens['--ba-secondary-text']),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(sameColour.secondaryColor, tokens['--ba-secondary-accent']),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves a palette that already contrasts on its own text colour', () => {
    const palette = { ...sameColour, textColor: '#FFFFFF' };
    expect(headerTokens(palette)['--ba-secondary-text']).toBe('#FFFFFF');
  });

  it.each(FILES)('%s: header text and accent meet AA over its secondary colour', (file) => {
    const { branding } = JSON.parse(readFileSync(`${FIXTURE_DIR}${file}`, 'utf8')) as {
      branding: HotsiteBrandingResponse;
    };
    const tokens = headerTokens(branding);
    expect(
      contrastRatio(branding.secondaryColor, tokens['--ba-secondary-text']),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(branding.secondaryColor, tokens['--ba-secondary-accent']),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe('text over an overlay (G20)', () => {
  it.each(FILES)('%s: every solid-overlay photo section gets readable text', (file) => {
    const result = parseManifestJson(readFileSync(`${FIXTURE_DIR}${file}`, 'utf8'));
    if (!result.success) throw new Error(result.error);
    const { branding, layout } = result.value;
    const plan = buildHotsiteModuleRenderPlan(
      layout,
      branding.alternateSectionBg ?? false,
      branding as HotsiteBrandingResponse,
    );
    for (const item of plan) {
      const overlay = item.presentation?.overlay;
      if (overlay?.type !== 'solid' || !item.sectionTokens) continue;
      const text = item.sectionTokens['--ba-section-text'];
      // A solid overlay at >= 0.5 opacity dominates the surface; the text must read on its colour.
      if (overlay.opacity >= 0.5) {
        expect(contrastRatio(overlay.color, text)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
