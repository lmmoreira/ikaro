import { CUSTOMER_FEATURE_KEYS, HOTSITE_MODULE_FEATURE } from '@ikaro/types';
import { FEATURE_KEYS, type FeatureKey } from '@ikaro/validation';
import {
  FeatureDependencyUnmetError,
  FeatureHasDependentsError,
  PlanEmptyError,
  SubscriptionInvariantError,
} from './errors/billing-domain.error';
import {
  FEATURE_REQUIREMENTS,
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

  // The dependency graph against the surfaces features gate. The web never re-derives entitlement
  // from the graph (the backend decides, and a plan can only be saved dependency-closed), so this is
  // the one place a new feature's surfaces are checked against it: a feature whose surface is hosted
  // by another must require that host, or a tenant could hold the feature without any page to show it.
  describe('the feature hierarchy against the surfaces features gate', () => {
    function requiredBy(feature: FeatureKey): Set<FeatureKey> {
      const seen = new Set<FeatureKey>();
      const pending = [...FEATURE_REQUIREMENTS[feature]];
      for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
        if (seen.has(next)) continue;
        seen.add(next);
        pending.push(...FEATURE_REQUIREMENTS[next]);
      }
      return seen;
    }

    it('has HOTSITE as the one root: it requires nothing and every other feature requires it', () => {
      expect(FEATURE_REQUIREMENTS.HOTSITE).toEqual([]);
      for (const feature of FEATURE_KEYS.filter((key) => key !== 'HOTSITE')) {
        expect([feature, requiredBy(feature).has('HOTSITE')]).toEqual([feature, true]);
      }
    });

    it('has no feature that requires itself, directly or through others', () => {
      for (const feature of FEATURE_KEYS) {
        expect([feature, requiredBy(feature).has(feature)]).toEqual([feature, false]);
      }
    });

    // The hotsite, its pages and its sections are hosted by HOTSITE: a feature whose module or page
    // the hotsite shows must require it.
    it.each(Object.values(HOTSITE_MODULE_FEATURE).filter((feature) => feature !== 'HOTSITE'))(
      '%s, which gates a hotsite module, requires HOTSITE',
      (feature) => {
        expect(requiredBy(feature)).toContain('HOTSITE');
      },
    );

    // The customer account lives on the tenant's hotsite.
    it.each(CUSTOMER_FEATURE_KEYS)(
      '%s, which has a customer-account surface, requires HOTSITE',
      (feature) => {
        expect(requiredBy(feature)).toContain('HOTSITE');
      },
    );

    // The points page offers a booking link, and the points accrue from bookings: a tenant with
    // LOYALTY always has BOOKING, so that link is never dead.
    it('makes LOYALTY require BOOKING', () => {
      expect(requiredBy('LOYALTY')).toContain('BOOKING');
    });
  });
});
