import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { HotsiteBrandingResponse } from '@ikaro/types';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './apply-branding';
import { sectionTints } from './section-tints';

const fixtures = fileURLToPath(
  new URL('../../../../../journeys/manager/prototypes/hotsite/hotsite-impl/', import.meta.url),
);

describe('sectionTints', () => {
  it.each(
    readdirSync(fixtures).filter((file) => /^manifesto-(?!v2-layout-proposal).+\.json$/.test(file)),
  )('%s keeps every tint readable against each template surface', (file) => {
    const { branding } = JSON.parse(readFileSync(`${fixtures}${file}`, 'utf8')) as {
      branding: HotsiteBrandingResponse;
    };
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
  });
});
