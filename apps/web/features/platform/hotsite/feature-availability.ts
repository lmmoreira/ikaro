import {
  HOTSITE_MODULE_FEATURE,
  type FeatureKey,
  type HotsiteManifestResponse,
  type HotsiteModuleResponse,
  type HotsiteModuleType,
} from '@ikaro/types';

// Which section a call-to-action target leads to (a hero, content-block or navigation button).
// `HOTSITE_MODULE_FEATURE` then says which feature that section needs, so a button is dropped when
// its section's feature is unavailable. A new gated section is one entry in each map: nothing below
// names a feature.
const CTA_TARGET_MODULE: Readonly<Record<string, HotsiteModuleType>> = {
  'booking-form': 'BOOKING_CTA',
  'lead-form': 'LEAD_FORM',
  'service-list': 'SERVICE_LIST',
  gallery: 'GALLERY',
  testimonials: 'TESTIMONIALS',
  about: 'ABOUT',
  contact: 'CONTACT',
};

type Availability = Pick<HotsiteManifestResponse, 'unavailableFeatures'>;

// `false` only when the backend lists the feature as unavailable. A manifest on the prior shape, or
// one with no answer, reads as available: the page renders as it did before.
export function isFeatureAvailable(manifest: Availability, feature: FeatureKey): boolean {
  return !manifest.unavailableFeatures?.includes(feature);
}

// Whether a button aimed at `target` would lead to a section the manifest omits for want of a feature.
function leadsToUnavailableSection(manifest: Availability, target: unknown): boolean {
  const type = typeof target === 'string' ? CTA_TARGET_MODULE[target] : undefined;
  const feature = type && HOTSITE_MODULE_FEATURE[type];
  return feature !== undefined && !isFeatureAvailable(manifest, feature);
}

function withoutKeys(
  data: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const rest = { ...data };
  for (const key of keys) delete rest[key];
  return rest;
}

// A module's own buttons that lead to an unavailable section. The hero's primary button is always in
// its data, so it is emptied (the hero draws no button without a label); every other one is removed.
function withoutDeadLinks(
  manifest: Availability,
  layoutModule: HotsiteModuleResponse,
): HotsiteModuleResponse {
  const { data } = layoutModule;
  const dead = (target: unknown): boolean => leadsToUnavailableSection(manifest, target);
  switch (layoutModule.type) {
    case 'NAVIGATION':
    case 'CONTENT_BLOCK': {
      const cta = data.cta as { target?: unknown } | undefined;
      return cta && dead(cta.target)
        ? { ...layoutModule, data: withoutKeys(data, ['cta']) }
        : layoutModule;
    }
    case 'HERO': {
      let next = data;
      if (dead(data.ctaTarget)) next = { ...next, ctaLabel: '' };
      if (dead(data.secondaryCtaTarget)) {
        next = withoutKeys(next, ['secondaryCtaLabel', 'secondaryCtaTarget']);
      }
      return next === data ? layoutModule : { ...layoutModule, data: next };
    }
    default:
      return layoutModule;
  }
}

// The manifest as the hotsite should render it: no button leads to a section the tenant's plan does
// not include (the sections themselves are already omitted by the backend). A tenant with every
// feature gets the very same object back.
export function withoutLinksToUnavailableSections(
  manifest: HotsiteManifestResponse,
): HotsiteManifestResponse {
  if (!manifest.unavailableFeatures?.length) return manifest;
  return {
    ...manifest,
    layout: manifest.layout.map((layoutModule) => withoutDeadLinks(manifest, layoutModule)),
  };
}
