import { buildTemplateManifest, CATALOGUE_TEMPLATE_IDS } from '@ikaro/hotsite-templates';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/features/platform/hotsite/apply-branding';
import {
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
    'on a %s page: surface or border differs from it, and a colour-independent shadow remains',
    (tenantBackground) => {
      for (const variant of VARIANTS) {
        const background = tenantBackground.toLowerCase();
        const hidesSurface = background === BRANDED_FEEDBACK_SURFACE;
        const hidesBorder = background === BRANDED_FEEDBACK_PALETTE[variant].border;

        expect(hidesSurface && hidesBorder).toBe(false);
      }
      expect(BRANDED_FEEDBACK_SHADOW).not.toBe('none');
    },
  );
});
