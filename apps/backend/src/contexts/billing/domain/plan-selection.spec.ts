import type { FeatureKey } from '@ikaro/validation';
import {
  FeatureDependencyUnmetError,
  FeatureHasDependentsError,
  PlanEmptyError,
  SubscriptionInvariantError,
} from './errors/billing-domain.error';
import {
  defaultSelection,
  defaultTierFor,
  isTierSoldFor,
  type SelectionEntry,
  validateSelection,
} from './plan-selection';

function thrownBy(fn: () => void): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to throw');
}

const sel = (...keys: FeatureKey[]): SelectionEntry[] =>
  keys.map((featureKey) => ({ featureKey, tier: defaultTierFor(featureKey) }));

describe('plan-selection', () => {
  describe('defaultSelection', () => {
    it('is every sellable feature, with chatbot at BASIC', () => {
      expect(defaultSelection()).toEqual([
        { featureKey: 'HOTSITE', tier: 'STANDARD' },
        { featureKey: 'BOOKING', tier: 'STANDARD' },
        { featureKey: 'LOYALTY', tier: 'STANDARD' },
        { featureKey: 'CHATBOT', tier: 'BASIC' },
        { featureKey: 'LEAD_FORM', tier: 'STANDARD' },
      ]);
    });

    it('keeps only the given subset, in catalogue order', () => {
      expect(defaultSelection(['CHATBOT', 'HOTSITE']).map((entry) => entry.featureKey)).toEqual([
        'HOTSITE',
        'CHATBOT',
      ]);
    });
  });

  describe('isTierSoldFor', () => {
    it('accepts BASIC and PLUS for the chatbot only, and STANDARD for everything else', () => {
      expect(isTierSoldFor('CHATBOT', 'BASIC')).toBe(true);
      expect(isTierSoldFor('CHATBOT', 'PLUS')).toBe(true);
      expect(isTierSoldFor('CHATBOT', 'STANDARD')).toBe(false);
      expect(isTierSoldFor('BOOKING', 'STANDARD')).toBe(true);
      expect(isTierSoldFor('BOOKING', 'PLUS')).toBe(false);
    });
  });

  describe('validateSelection', () => {
    it('accepts the full catalogue and any closed subset', () => {
      expect(() => validateSelection([], defaultSelection())).not.toThrow();
      expect(() => validateSelection([], sel('HOTSITE'))).not.toThrow();
      expect(() => validateSelection([], sel('HOTSITE', 'BOOKING', 'LOYALTY'))).not.toThrow();
      expect(() => validateSelection([], sel('HOTSITE', 'CHATBOT', 'LEAD_FORM'))).not.toThrow();
    });

    it('rejects an empty selection with PlanEmptyError', () => {
      expect(() => validateSelection(defaultSelection(), [])).toThrow(PlanEmptyError);
    });

    it.each<[string, FeatureKey[]]>([
      ['BOOKING without HOTSITE', ['BOOKING']],
      ['CHATBOT without HOTSITE', ['CHATBOT']],
      ['LEAD_FORM without HOTSITE', ['LEAD_FORM']],
      ['LOYALTY without BOOKING', ['HOTSITE', 'LOYALTY']],
    ])('rejects %s as an unmet dependency when it was never in the plan', (_name, keys) => {
      expect(() => validateSelection([], sel(...keys))).toThrow(FeatureDependencyUnmetError);
    });

    it('names the feature and the requirement it lacks', () => {
      expect(thrownBy(() => validateSelection([], sel('HOTSITE', 'LOYALTY')))).toMatchObject({
        featureKey: 'LOYALTY',
        requiredFeatureKey: 'BOOKING',
      });
    });

    it('rejects removing a requirement a kept feature depends on as HAS_DEPENDENTS', () => {
      const current = defaultSelection();
      const error = thrownBy(() => validateSelection(current, sel('HOTSITE', 'LOYALTY')));
      expect(error).toBeInstanceOf(FeatureHasDependentsError);
      expect(error).toMatchObject({ featureKey: 'BOOKING', dependentFeatureKey: 'LOYALTY' });
    });

    it('never lets HOTSITE be removed: any other feature needs it', () => {
      const current = defaultSelection();
      expect(() => validateSelection(current, sel('BOOKING', 'LOYALTY'))).toThrow(
        FeatureHasDependentsError,
      );
      expect(() => validateSelection(current, sel('CHATBOT'))).toThrow(FeatureHasDependentsError);
    });

    it('accepts removing a leaf feature, and removing a feature together with its dependents', () => {
      const current = defaultSelection();
      expect(() => validateSelection(current, sel('HOTSITE', 'BOOKING', 'CHATBOT'))).not.toThrow();
      expect(() =>
        validateSelection(current, sel('HOTSITE', 'CHATBOT', 'LEAD_FORM')),
      ).not.toThrow();
    });

    it('accepts a tier change on the chatbot and rejects an invalid tier', () => {
      const withPlus: SelectionEntry[] = [
        { featureKey: 'HOTSITE', tier: 'STANDARD' },
        { featureKey: 'CHATBOT', tier: 'PLUS' },
      ];
      expect(() => validateSelection(defaultSelection(), withPlus)).not.toThrow();
      expect(() => validateSelection([], [{ featureKey: 'HOTSITE', tier: 'PLUS' }])).toThrow(
        SubscriptionInvariantError,
      );
    });

    it('rejects the same feature selected twice', () => {
      expect(() => validateSelection([], [...sel('HOTSITE'), ...sel('HOTSITE')])).toThrow(
        SubscriptionInvariantError,
      );
    });

    it('is pure: it mutates neither input', () => {
      const current = defaultSelection();
      const proposed = sel('HOTSITE', 'BOOKING');
      const before = JSON.stringify([current, proposed]);
      validateSelection(current, proposed);
      expect(JSON.stringify([current, proposed])).toBe(before);
    });
  });
});
