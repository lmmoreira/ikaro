import type { HotsiteBrandingResponse } from '@ikaro/types';
import { buildTemplateManifest, CATALOGUE_TEMPLATE_IDS } from '@ikaro/hotsite-templates';
import { describe, expect, it } from 'vitest';
import { applyBranding, contrastRatio } from './apply-branding';
import { parseManifestJson } from './manifest-schema';
import { buildHotsiteModuleRenderPlan } from './page-model';

const IDENTITY = { brandName: 'Marca Exemplo', tagline: 'Slogan de exemplo' };
const TEMPLATES = [...CATALOGUE_TEMPLATE_IDS];

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

  it.each(TEMPLATES)('%s: header text and accent meet AA over its secondary colour', (id) => {
    const branding = buildTemplateManifest(id, 'pt-BR', IDENTITY)
      .branding as unknown as HotsiteBrandingResponse;
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
  it.each(TEMPLATES)('%s: every solid-overlay photo section gets readable text', (id) => {
    const result = parseManifestJson(JSON.stringify(buildTemplateManifest(id, 'pt-BR', IDENTITY)));
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
