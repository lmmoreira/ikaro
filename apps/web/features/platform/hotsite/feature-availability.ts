import {
  HOTSITE_LINK_TARGET_MODULE,
  HOTSITE_MODULE_FEATURE,
  type FeatureKey,
  type HotsiteLinkTarget,
  type HotsiteManifestResponse,
  type HotsiteModuleResponse,
} from '@ikaro/types';

type Availability = Pick<HotsiteManifestResponse, 'unavailableFeatures'>;

// `false` only when the backend lists the feature as unavailable. A manifest on the prior shape, or
// one with no answer, reads as available: the page renders as it did before.
export function isFeatureAvailable(manifest: Availability, feature: FeatureKey): boolean {
  return !manifest.unavailableFeatures?.includes(feature);
}

// The public hotsite pages a feature owns, by route under `/{slug}` (the folder of the page under
// `app/[slug]/`). A tenant without the feature has no such page: it renders the neutral
// "Página indisponível", never an error. A new gated page is one row here (the scan spec fails on a
// public page that is neither listed here nor declared to need no feature); `/lead-form` is owned by
// its module instead, which the manifest omits for a tenant without the feature.
export const HOTSITE_PAGE_FEATURE = {
  booking: 'BOOKING',
  'booking/availability-alert': 'BOOKING',
  'servicos/[serviceSlug]': 'BOOKING',
} as const satisfies Readonly<Record<string, FeatureKey>>;

export type HotsiteFeaturePage = keyof typeof HOTSITE_PAGE_FEATURE;

// Whether a page the hotsite offers can be opened: the hotsite is published and the page's feature is
// available. The page's metadata and its body both ask this, so they can never disagree.
export function isHotsitePageAvailable(
  manifest: Availability & Pick<HotsiteManifestResponse, 'isPublished'>,
  page: HotsiteFeaturePage,
): boolean {
  return manifest.isPublished && isFeatureAvailable(manifest, HOTSITE_PAGE_FEATURE[page]);
}

// The feature the section behind a button's `target` needs: `HOTSITE_LINK_TARGET_MODULE` says which
// section a target leads to and `HOTSITE_MODULE_FEATURE` which feature that section needs, so a new
// gated section is one entry in each map and nothing here names a feature. `undefined` when the
// target leads to no section (`home`), when its section needs no feature, and when it is not a link
// target at all (the manifest carries an arbitrary string; an own-property check keeps names such as
// `constructor` out): in each case the button is kept.
function featureBehindTarget(target: unknown): FeatureKey | undefined {
  if (typeof target !== 'string' || !Object.hasOwn(HOTSITE_LINK_TARGET_MODULE, target)) {
    return undefined;
  }
  const type = HOTSITE_LINK_TARGET_MODULE[target as HotsiteLinkTarget];
  return type === null ? undefined : HOTSITE_MODULE_FEATURE[type];
}

// Whether a button aimed at `target` would lead to a section the manifest omits for want of a feature.
function leadsToUnavailableSection(manifest: Availability, target: unknown): boolean {
  const feature = featureBehindTarget(target);
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
