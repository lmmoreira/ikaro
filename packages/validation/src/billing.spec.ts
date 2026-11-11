import {
  CHATBOT_TIERS,
  FEATURE_KEYS,
  type FeatureKey,
  findUnmetFeatureRequirement,
} from './billing';

describe('billing closed enums', () => {
  it('lists the five sellable features, with recurrence and alerts inside BOOKING', () => {
    expect([...FEATURE_KEYS]).toEqual(['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM']);
  });

  it('lists the two chatbot tiers', () => {
    expect([...CHATBOT_TIERS]).toEqual(['BASIC', 'PLUS']);
  });
});

describe('findUnmetFeatureRequirement', () => {
  it.each<[string, FeatureKey[]]>([
    ['HOTSITE alone', ['HOTSITE']],
    ['HOTSITE + BOOKING', ['HOTSITE', 'BOOKING']],
    ['HOTSITE + BOOKING + LOYALTY', ['HOTSITE', 'BOOKING', 'LOYALTY']],
    ['HOTSITE + CHATBOT', ['HOTSITE', 'CHATBOT']],
    ['HOTSITE + LEAD_FORM', ['HOTSITE', 'LEAD_FORM']],
    ['every feature', [...FEATURE_KEYS]],
    ['an empty selection', []],
  ])('returns null for %s', (_label, keys) => {
    expect(findUnmetFeatureRequirement(keys)).toBeNull();
  });

  it.each<[string, FeatureKey[], FeatureKey, FeatureKey]>([
    ['BOOKING alone', ['BOOKING'], 'BOOKING', 'HOTSITE'],
    ['LOYALTY without BOOKING', ['HOTSITE', 'LOYALTY'], 'LOYALTY', 'BOOKING'],
    ['CHATBOT without HOTSITE', ['CHATBOT'], 'CHATBOT', 'HOTSITE'],
    ['LEAD_FORM without HOTSITE', ['LEAD_FORM'], 'LEAD_FORM', 'HOTSITE'],
  ])('reports %s', (_label, keys, feature, required) => {
    expect(findUnmetFeatureRequirement(keys)).toEqual({ feature, required });
  });

  it('reports the first unmet feature in catalogue order, whatever the input order', () => {
    expect(findUnmetFeatureRequirement(['LEAD_FORM', 'BOOKING'])).toEqual({
      feature: 'BOOKING',
      required: 'HOTSITE',
    });
  });
});
