import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_FEATURE_KEYS,
  HOTSITE_MODULE_FEATURE,
  HotsiteCtaTargetSchema,
  type FeatureKey,
  type HotsiteManifestResponse,
  type HotsiteModuleResponse,
  type HotsiteModuleType,
} from '@ikaro/types';
import { getCustomerNavItems } from '@/features/customer/components/customer-nav-items';
import {
  CTA_TARGET_MODULE,
  isFeatureAvailable,
  withoutLinksToUnavailableSections,
} from '@/features/platform/hotsite/feature-availability';
import {
  SETTINGS_SECTION_FEATURE,
  lockedSettingsSections,
} from '@/features/platform/settings-locked-sections';
import { ALL_FEATURES, ROUTE_FEATURES } from './feature-registry';
import { lockedHotsiteModules } from './locked-modules';

// The contract every feature-owned surface keeps, written over the registries so a new feature or
// gated module is checked the moment it is added, with no new test to remember. A failure here
// means a feature was added without deciding what happens to its surfaces when a tenant lacks it.

// A feature that owns no surface anywhere (no hotsite module or page, no customer tab, no dashboard
// route) is declared here, on purpose, with the reason. Empty today.
const FEATURES_WITHOUT_SURFACE: readonly FeatureKey[] = [];

const GATED_MODULES = Object.entries(HOTSITE_MODULE_FEATURE) as [HotsiteModuleType, FeatureKey][];
const GATING_FEATURES = [...new Set(GATED_MODULES.map(([, feature]) => feature))];

function manifestOf(
  layout: HotsiteModuleResponse[],
  unavailableFeatures: FeatureKey[],
): HotsiteManifestResponse {
  return { layout, unavailableFeatures } as HotsiteManifestResponse;
}

describe('every feature has a decided surface', () => {
  it.each(ALL_FEATURES)(
    '%s owns a hotsite module, a customer tab or a dashboard route',
    (feature) => {
      const owners = [
        ...GATED_MODULES.map(([, gating]) => gating),
        ...CUSTOMER_FEATURE_KEYS,
        ...ROUTE_FEATURES.map(([, routeFeature]) => routeFeature),
        ...Object.values(SETTINGS_SECTION_FEATURE),
        ...FEATURES_WITHOUT_SURFACE,
      ];

      expect(owners).toContain(feature);
    },
  );
});

describe('a gated hotsite module', () => {
  it.each(GATED_MODULES)(
    '%s is locked in the editor exactly when %s is locked',
    (type, feature) => {
      expect(lockedHotsiteModules([feature])[type]).toBe(feature);
      expect(lockedHotsiteModules([])[type]).toBeUndefined();
    },
  );
});

describe('a button on the hotsite', () => {
  const entries = Object.entries(CTA_TARGET_MODULE);

  describe.each(GATING_FEATURES)('when %s is unavailable', (missing) => {
    it.each(entries)(
      'aimed at "%s" (%s) is kept or dropped by its section feature',
      (target, moduleType) => {
        const gate = HOTSITE_MODULE_FEATURE[moduleType];
        const block: HotsiteModuleResponse = {
          type: 'CONTENT_BLOCK',
          enabled: true,
          data: { variant: 'text', body: 'x', cta: { label: 'Go', target } },
        };

        const [after] = withoutLinksToUnavailableSections(manifestOf([block], [missing])).layout;

        expect('cta' in after.data).toBe(gate !== missing);
      },
    );
  });

  it.each(entries)('aimed at "%s" is always kept when every feature is available', (target) => {
    const block: HotsiteModuleResponse = {
      type: 'CONTENT_BLOCK',
      enabled: true,
      data: { variant: 'text', body: 'x', cta: { label: 'Go', target } },
    };
    const manifest = manifestOf([block], []);

    expect(withoutLinksToUnavailableSections(manifest)).toBe(manifest);
  });

  it('names a section for every target a button can have', () => {
    // The hero and content-block targets are a closed enum, the navigation button adds `lead-form`.
    expect(Object.keys(CTA_TARGET_MODULE)).toEqual(
      expect.arrayContaining([...HotsiteCtaTargetSchema.options, 'lead-form']),
    );
  });
});

describe('a hotsite page owned by a feature', () => {
  it.each(GATING_FEATURES)('is unavailable exactly when the manifest lists %s', (feature) => {
    expect(isFeatureAvailable(manifestOf([], [feature]), feature)).toBe(false);
    expect(isFeatureAvailable(manifestOf([], []), feature)).toBe(true);
  });
});

describe('the customer account', () => {
  it.each(CUSTOMER_FEATURE_KEYS)(
    'has a tab for %s, and hides it, and only it, without the feature',
    (feature) => {
      const all = getCustomerNavItems('t', [...CUSTOMER_FEATURE_KEYS]);
      const without = getCustomerNavItems(
        't',
        CUSTOMER_FEATURE_KEYS.filter((key) => key !== feature),
      );

      expect(all.some((item) => item.feature === feature)).toBe(true);
      expect(without.some((item) => item.feature === feature)).toBe(false);
      expect(without).toHaveLength(
        all.length - all.filter((item) => item.feature === feature).length,
      );
    },
  );

  it('always keeps Início, whatever the tenant holds', () => {
    expect(getCustomerNavItems('t', []).map((item) => item.feature)).toEqual([undefined]);
  });
});

describe('the settings page', () => {
  it.each(Object.entries(SETTINGS_SECTION_FEATURE))(
    'locks the %s section with the %s feature, and every such feature is a real one',
    (section, feature) => {
      expect(ALL_FEATURES).toContain(feature);
      expect(lockedSettingsSections([feature])).toHaveProperty(section, feature);
    },
  );
});
