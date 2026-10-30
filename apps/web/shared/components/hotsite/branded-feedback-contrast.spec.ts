import { buildTemplateManifest, CATALOGUE_TEMPLATE_IDS } from '@ikaro/hotsite-templates';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/features/platform/hotsite/apply-branding';
import {
  BRANDED_FEEDBACK_EDGE,
  BRANDED_FEEDBACK_PALETTE,
  BRANDED_FEEDBACK_SHADOW,
  BRANDED_FEEDBACK_SURFACE,
  BRANDED_FIELD_MESSAGE_COLOR,
} from './branded-feedback-palette';

const IDENTITY = { brandName: 'Marca Exemplo', tagline: 'Slogan de exemplo' };
const VARIANTS = ['error', 'success'] as const;

// Tenants whose own colours match the message colours, or sit at the extremes.
const ADVERSARIAL_BACKGROUNDS = [
  '#dc2626',
  '#991b1b',
  '#16a34a',
  '#166534',
  '#ffffff',
  '#0a0a0a',
  '#fef3c7',
];

const TEMPLATE_BACKGROUNDS = [...CATALOGUE_TEMPLATE_IDS].flatMap((id) => {
  const { branding } = buildTemplateManifest(id, 'pt-BR', IDENTITY);
  return [branding.backgroundColor, branding.secondaryColor, branding.primaryColor];
});

describe('branded feedback palette contrast', () => {
  it.each(VARIANTS)('%s: text on its own surface meets AA', (variant) => {
    expect(
      contrastRatio(BRANDED_FEEDBACK_SURFACE, BRANDED_FEEDBACK_PALETTE[variant].text),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(VARIANTS)(
    '%s: border and accent bar on the surface meet the 3:1 non-text bar',
    (variant) => {
      expect(
        contrastRatio(BRANDED_FEEDBACK_SURFACE, BRANDED_FEEDBACK_PALETTE[variant].border),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it('the field message meets AA on its own white chip', () => {
    expect(
      contrastRatio(BRANDED_FEEDBACK_SURFACE, BRANDED_FIELD_MESSAGE_COLOR),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the box never disappears into a tenant palette', () => {
  it.each(VARIANTS)(
    '%s: surface and border are different colours, so no single tenant colour hides both',
    (variant) => {
      expect(BRANDED_FEEDBACK_PALETTE[variant].border).not.toBe(BRANDED_FEEDBACK_SURFACE);
    },
  );

  it.each([...ADVERSARIAL_BACKGROUNDS, ...TEMPLATE_BACKGROUNDS])(
    'on a %s page: the white surface, the dark ring or the border stands out by at least 3:1',
    (tenantBackground) => {
      for (const variant of VARIANTS) {
        const separation = Math.max(
          contrastRatio(tenantBackground, BRANDED_FEEDBACK_SURFACE),
          contrastRatio(tenantBackground, BRANDED_FEEDBACK_EDGE),
          contrastRatio(tenantBackground, BRANDED_FEEDBACK_PALETTE[variant].border),
        );

        expect(separation).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it('draws the dark ring in the shadow, not as a tenant colour', () => {
    expect(BRANDED_FEEDBACK_SHADOW).toContain(BRANDED_FEEDBACK_EDGE);
  });

  it('sweeps every gray level: the surface or the ring always reaches 3:1', () => {
    for (let level = 0; level <= 255; level += 1) {
      const channel = level.toString(16).padStart(2, '0');
      const background = `#${channel}${channel}${channel}`;
      const separation = Math.max(
        contrastRatio(background, BRANDED_FEEDBACK_SURFACE),
        contrastRatio(background, BRANDED_FEEDBACK_EDGE),
      );

      expect(separation, background).toBeGreaterThanOrEqual(3);
    }
  });
});
