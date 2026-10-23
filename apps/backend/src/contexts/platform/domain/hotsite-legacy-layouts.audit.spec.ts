import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HotsiteBrandingSchema, HotsiteModuleSchema } from '@ikaro/validation';
import { HotsiteConfigBuilder } from '../../../test/builders/platform';
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
const PROTOTYPE_DIR = join(
  __dirname,
  '../../../../../../journeys/manager/prototypes/hotsite/hotsite-impl',
);

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

  // The six prototype manifests are today's schema (no presentation, NAVIGATION or CONTENT_BLOCK);
  // They are due to be rewritten. Their layouts are what a manager could paste into the Manifesto tab.
  describe('prototype manifests (journeys/manager/prototypes/hotsite/hotsite-impl)', () => {
    const manifests = readdirSync(PROTOTYPE_DIR).filter((file) =>
      /^manifesto-(?!v2-layout-proposal).+\.json$/.test(file),
    );

    it('finds the six template manifests', () => {
      expect(manifests).toHaveLength(6);
    });

    it.each(manifests)('%s layout passes the module schema', (file) => {
      const manifest = JSON.parse(readFileSync(join(PROTOTYPE_DIR, file), 'utf8')) as {
        layout: unknown[];
      };
      expectEveryModuleToPass(manifest.layout);
    });
  });
});
