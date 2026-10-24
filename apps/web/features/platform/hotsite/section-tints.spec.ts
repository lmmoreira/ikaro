import type { HotsiteBrandingResponse } from '@ikaro/types';
import { buildTemplateManifest, CATALOGUE_TEMPLATE_IDS } from '@ikaro/hotsite-templates';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './apply-branding';
import { sectionTints } from './section-tints';

const IDENTITY = { brandName: 'Marca Exemplo', tagline: 'Slogan de exemplo' };

describe('sectionTints', () => {
  it.each([...CATALOGUE_TEMPLATE_IDS])(
    '%s keeps every tint readable against each template surface',
    (id) => {
      const branding = buildTemplateManifest(id, 'pt-BR', IDENTITY)
        .branding as unknown as HotsiteBrandingResponse;
      for (const surface of [
        branding.backgroundColor,
        branding.secondaryColor,
        branding.primaryColor,
      ]) {
        const tints = sectionTints(branding, surface);
        expect(tints).toHaveLength(3);
        for (const tint of tints) {
          expect(contrastRatio(tint.background, tint.text)).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );
});
