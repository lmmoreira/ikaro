import type { HotsiteBrandingResponse } from '@ikaro/types';
import { buildTemplateManifest, CATALOGUE_TEMPLATE_IDS } from '@ikaro/hotsite-templates';
import { describe, expect, it } from 'vitest';
import { applyBranding, contrastRatio } from '@/features/platform/hotsite/apply-branding';

const IDENTITY = { brandName: 'Marca Exemplo', tagline: 'Slogan de exemplo' };
const AA = 4.5;

// The reported tenant shape: the text colour equals the secondary colour, so the inherited
// `--ba-text` is invisible on the panel.
const SAME_COLOUR: HotsiteBrandingResponse = {
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

// Palettes at the extremes, where a derived colour is most likely to fall short.
const ADVERSARIAL: readonly HotsiteBrandingResponse[] = [
  { ...SAME_COLOUR, secondaryColor: '#FFFFFF', textColor: '#FFFFFF' },
  { ...SAME_COLOUR, secondaryColor: '#000000', textColor: '#000000' },
  { ...SAME_COLOUR, secondaryColor: '#777777', textColor: '#777777' },
  { ...SAME_COLOUR, secondaryColor: '#2F6F4F', primaryColor: '#2F6F4F', textColor: '#2F6F4F' },
  { ...SAME_COLOUR, secondaryColor: '#FEF3C7', textColor: '#FDE68A' },
];

const TEMPLATE_BRANDINGS = [...CATALOGUE_TEMPLATE_IDS].map((id) => ({
  id,
  branding: buildTemplateManifest(id, 'pt-BR', IDENTITY).branding as HotsiteBrandingResponse,
}));

function expectReadable(branding: HotsiteBrandingResponse): void {
  const derived = applyBranding(branding);
  const surface = branding.secondaryColor;

  expect(contrastRatio(surface, derived['--ba-secondary-text'])).toBeGreaterThanOrEqual(AA);
  expect(contrastRatio(surface, derived['--ba-secondary-accent'])).toBeGreaterThanOrEqual(AA);
  expect(contrastRatio(surface, derived['--ba-secondary-muted'])).toBeGreaterThanOrEqual(AA);
}

describe('text, accent and placeholder on the secondary surface', () => {
  it.each(TEMPLATE_BRANDINGS)(
    '$id: text, accent and placeholder meet AA over the secondary colour',
    ({ branding }) => {
      expectReadable(branding);
    },
  );

  it('the reported textColor === secondaryColor tenant stays readable', () => {
    expectReadable(SAME_COLOUR);
  });

  it.each(ADVERSARIAL)('adversarial palette %# stays readable', (branding) => {
    expectReadable(branding);
  });

  it('negative guarantee: the inherited text colour fails AA for the reported tenant', () => {
    // Pins the defect this story removes: painting the panel without the derived token leaves the
    // page `--ba-text` on the secondary colour, and for this tenant that is unreadable.
    expect(contrastRatio(SAME_COLOUR.secondaryColor, SAME_COLOUR.textColor)).toBeLessThan(AA);
    expect(
      contrastRatio(SAME_COLOUR.secondaryColor, applyBranding(SAME_COLOUR)['--ba-secondary-text']),
    ).toBeGreaterThanOrEqual(AA);
  });

  it('a palette whose text colour already reads keeps that exact colour', () => {
    const readable = { ...SAME_COLOUR, textColor: '#FFFFFF' };

    expect(applyBranding(readable)['--ba-secondary-text']).toBe('#FFFFFF');
  });
});
