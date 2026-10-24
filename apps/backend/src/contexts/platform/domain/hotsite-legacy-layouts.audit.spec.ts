import { buildTemplateManifest, CATALOGUE_TEMPLATE_IDS } from '@ikaro/hotsite-templates';
import { HotsiteBrandingSchema, HotsiteModuleSchema } from '@ikaro/validation';
import { HotsiteConfigBuilder } from '../../../test/builders/platform';
import type { HotsiteModule } from './hotsite-config.types';
import { assertValidLayoutStructure } from './hotsite-layout.rules';
import { HotsiteConfigEntityBuilder } from '../../../test/builders/platform/hotsite-config-entity.builder';
import {
  SEED_HOTSITE_BASE_BRANDING,
  SEED_HOTSITE_BRANDING_OVERRIDES,
  SEED_HOTSITE_LAYOUT_A,
  SEED_HOTSITE_LAYOUT_B,
  SEED_HOTSITE_LAYOUT_IKARO,
} from '../../../shared/database/seed-hotsite-fixtures';

// The layout request schema replaced the unconstrained `data: z.record()` of the layout request schema with a full
// per-module schema. Nothing is seeded in production, but "no production deployment" is audited
// rather than assumed: every layout this repository can put in front of that schema must still be
// accepted. A stored layout that does not pass is rejected on its next save, so a fixture failing
// here is either a fixture bug or a rule that is tighter than the editors it must serve.
//
// Not covered here, deliberately: apps/web's DEFAULT_MODULE_DATA (default-layout.spec.ts checks it
// against the web mirror of these schemas, which the shared contract fixtures keep in step) and
// the e2e helpers, which carry no layout literal — they read the live config and send it back.
const IDENTITY = { brandName: 'Marca Exemplo', tagline: 'Slogan de exemplo' };
const LOCALES = ['pt-BR', 'en'] as const;

function expectEveryModuleToPass(layout: readonly unknown[]): void {
  // An empty fixture proves nothing, so it fails rather than passing vacuously.
  expect(layout.length).toBeGreaterThan(0);
  const failures = layout.flatMap((module, index) => {
    const result = HotsiteModuleSchema.safeParse(module);
    return result.success
      ? []
      : [{ index, type: (module as { type?: string }).type, issues: result.error.issues }];
  });
  expect(failures).toEqual([]);
}

describe('legacy layout audit', () => {
  it.each([
    ['seed: Ikaro tenant', SEED_HOTSITE_LAYOUT_IKARO],
    ['seed: tenant A', SEED_HOTSITE_LAYOUT_A],
    ['seed: tenant B', SEED_HOTSITE_LAYOUT_B],
  ])('%s layout passes the module schema', (_label, layout) => {
    expectEveryModuleToPass(layout);
  });

  it.each(Object.entries(SEED_HOTSITE_BRANDING_OVERRIDES))(
    'seed branding for %s passes the branding schema, legacy default font included',
    (_tenant, overrides) => {
      expect(
        HotsiteBrandingSchema.safeParse({ ...SEED_HOTSITE_BASE_BRANDING, ...overrides }).success,
      ).toBe(true);
    },
  );

  it("the test builders' default layouts pass the module schema", () => {
    expectEveryModuleToPass(new HotsiteConfigBuilder().buildWithContent().layout);
    expectEveryModuleToPass(new HotsiteConfigEntityBuilder().build().layout);
  });

  // The six catalogue templates are what the apply operation hands a manager and what they could
  // paste into the Manifesto tab. They use the final schema (NAVIGATION, CONTENT_BLOCK,
  // presentation), so each must pass the request schema, the aggregate's cross-field rules and the
  // branding schema, in every locale the copy ships in.
  describe('catalogue templates (packages/hotsite-templates)', () => {
    it('finds the six template manifests', () => {
      expect(CATALOGUE_TEMPLATE_IDS).toHaveLength(6);
    });

    const cases = CATALOGUE_TEMPLATE_IDS.flatMap((id) =>
      LOCALES.map((locale) => [id, locale] as const),
    );

    it.each(cases)('%s (%s) layout passes the module schema', (id, locale) => {
      expectEveryModuleToPass(buildTemplateManifest(id, locale, IDENTITY).layout);
    });

    it.each(cases)(
      '%s (%s) layout passes the aggregate cross-field rules (NAVIGATION first, enabled targets, presentation placement)',
      (id, locale) => {
        expect(() =>
          assertValidLayoutStructure(
            buildTemplateManifest(id, locale, IDENTITY).layout as HotsiteModule[],
          ),
        ).not.toThrow();
      },
    );

    it.each(cases)('%s (%s) branding passes the branding schema', (id, locale) => {
      expect(
        HotsiteBrandingSchema.safeParse(buildTemplateManifest(id, locale, IDENTITY).branding)
          .success,
      ).toBe(true);
    });
  });
});
