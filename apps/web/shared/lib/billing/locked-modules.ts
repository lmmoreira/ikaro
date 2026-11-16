import { HOTSITE_MODULE_FEATURE, type FeatureKey, type HotsiteModuleType } from '@ikaro/types';
import { isFeatureLocked } from './feature-registry';

// The hotsite modules whose own feature the tenant does not hold, with that feature (UC-125). Only
// the module types that need a feature of their own appear in `HOTSITE_MODULE_FEATURE` (the Chatbot
// and the lead form); every other module rides on the page's HOTSITE feature.
export function lockedHotsiteModules(
  lockedFeatures: readonly FeatureKey[],
): Partial<Record<HotsiteModuleType, FeatureKey>> {
  const locked: Partial<Record<HotsiteModuleType, FeatureKey>> = {};
  for (const [type, feature] of Object.entries(HOTSITE_MODULE_FEATURE) as [
    HotsiteModuleType,
    FeatureKey,
  ][]) {
    if (isFeatureLocked(feature, lockedFeatures)) locked[type] = feature;
  }
  return locked;
}
