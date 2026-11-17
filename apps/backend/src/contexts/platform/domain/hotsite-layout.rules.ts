import { HOTSITE_LINK_TARGET_MODULE, NAVIGATION_CTA_REQUIRED_MODULE } from '@ikaro/types';
import {
  HotsiteModuleDuplicateError,
  HotsiteNavigationNotFirstError,
  HotsiteNavigationTargetNotEnabledError,
  HotsitePresentationBackgroundNotAllowedError,
  HotsitePresentationNotAllowedError,
} from './errors/platform-domain.error';
import { HotsiteModule, HotsiteModuleType, NavigationModuleData } from './hotsite-config.types';

// Cross-field layout rules, kept out of hotsite-config.aggregate.ts to hold it under the
// file-length cap (same extraction as hotsite-config.mapper.ts). Each rule needs the whole layout,
// so it cannot live in the per-module request schema in @ikaro/validation; the schema owns the
// closed *shape* of each module, this file owns the rules between modules and between a module and
// its presentation (docs/ENGINEERING_RULES_SHARED.md § Single source of truth for a validation
// rule's code) — a condition is reported by exactly one of the two layers, never both.

// Modules whose section may carry a `presentation` at all. NAVIGATION is page chrome rendered by
// the top bar, while CHATBOT is a floating widget.
const PRESENTATION_MODULE_TYPES: ReadonlySet<HotsiteModuleType> = new Set([
  'HERO',
  'SERVICE_LIST',
  'GALLERY',
  'TESTIMONIALS',
  'BOOKING_CTA',
  'ABOUT',
  'CONTACT',
  'LEAD_FORM',
  'CONTENT_BLOCK',
  'FOOTER',
]);

// Modules without a background image of their own. HERO, BOOKING_CTA and LEAD_FORM keep their
// existing data.backgroundImageUrl, so one section never has two competing background images.
const PRESENTATION_BACKGROUND_MODULE_TYPES: ReadonlySet<HotsiteModuleType> = new Set([
  'SERVICE_LIST',
  'GALLERY',
  'TESTIMONIALS',
  'ABOUT',
  'CONTACT',
  'CONTENT_BLOCK',
]);

function assertModulePresentation(module: HotsiteModule): void {
  if (module.presentation === undefined) return;
  if (!PRESENTATION_MODULE_TYPES.has(module.type)) {
    throw new HotsitePresentationNotAllowedError(module.type);
  }
  if (
    module.type === 'FOOTER' &&
    Object.keys(module.presentation).some((key) => key !== 'surface' && key !== 'customColor')
  ) {
    throw new HotsitePresentationNotAllowedError(module.type);
  }
  if (
    module.presentation.background !== undefined &&
    !PRESENTATION_BACKGROUND_MODULE_TYPES.has(module.type)
  ) {
    throw new HotsitePresentationBackgroundNotAllowedError(module.type);
  }
}

// An enabled NAVIGATION must never leave a dead link: every item's target section has to be an
// enabled module of the same layout, and so does the module its header button needs (the lead form
// for /{slug}/lead-form, which is unavailable without it). A disabled NAVIGATION renders nothing,
// so its items are not checked until it is enabled — otherwise a stale, hidden navigation could
// block unrelated saves. Both lookups read the shared maps in @ikaro/types: `home` leads to no
// section, and the `booking-form` header button needs no module.
function assertNavigationTargetsEnabled(layout: readonly HotsiteModule[]): void {
  const navigation = layout.find((module) => module.type === 'NAVIGATION');
  if (!navigation?.enabled) return;

  const enabledTypes = new Set(layout.filter((m) => m.enabled).map((m) => m.type));
  const { items, cta } = navigation.data as NavigationModuleData;
  for (const item of items) {
    const requiredType = HOTSITE_LINK_TARGET_MODULE[item.target];
    if (requiredType !== null && !enabledTypes.has(requiredType)) {
      throw new HotsiteNavigationTargetNotEnabledError(item.target);
    }
  }
  const requiredForCta = cta ? NAVIGATION_CTA_REQUIRED_MODULE[cta.target] : null;
  if (cta && requiredForCta !== null && !enabledTypes.has(requiredForCta)) {
    throw new HotsiteNavigationTargetNotEnabledError(cta.target);
  }
}

export function assertValidLayoutStructure(layout: readonly HotsiteModule[]): void {
  const seen = new Set<HotsiteModuleType>();
  layout.forEach((module, index) => {
    if (seen.has(module.type)) throw new HotsiteModuleDuplicateError(module.type);
    seen.add(module.type);
    if (module.type === 'NAVIGATION' && index !== 0) throw new HotsiteNavigationNotFirstError();
    assertModulePresentation(module);
  });
  assertNavigationTargetsEnabled(layout);
}
