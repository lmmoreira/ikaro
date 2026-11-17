import type { FeatureKey } from '@ikaro/types';

// The settings sections that belong to a Billing feature, by the name of the `settings` key each one
// writes. A tenant without the feature sees the locked card in place of the section, and a save
// leaves that key out so what the manager already stored stays untouched (UC-125 A2). A new section
// that belongs to a feature is one entry here; nothing else in the form names a feature.
export const SETTINGS_SECTION_FEATURE = {
  booking: 'BOOKING',
  loyalty: 'LOYALTY',
  leadForm: 'LEAD_FORM',
  chatbot: 'CHATBOT',
} as const satisfies Readonly<Record<string, FeatureKey>>;

export type LockableSettingsSection = keyof typeof SETTINGS_SECTION_FEATURE;

// The sections whose feature is locked, with that feature.
export function lockedSettingsSections(
  lockedFeatures: readonly FeatureKey[],
): Partial<Record<LockableSettingsSection, FeatureKey>> {
  const locked: Partial<Record<LockableSettingsSection, FeatureKey>> = {};
  for (const [section, feature] of Object.entries(SETTINGS_SECTION_FEATURE) as [
    LockableSettingsSection,
    FeatureKey,
  ][]) {
    if (lockedFeatures.includes(feature)) locked[section] = feature;
  }
  return locked;
}

// The save payload without the locked sections. The backend merges a partial `settings` object, so a
// key that is left out is never written; the input is not mutated.
export function withoutLockedSettings<T extends object>(
  settings: T,
  lockedSections: readonly string[],
): T {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !lockedSections.includes(key)),
  ) as T;
}
