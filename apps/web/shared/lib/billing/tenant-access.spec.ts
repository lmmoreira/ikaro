import { describe, expect, it } from 'vitest';
import { lockedFeaturesOf, toTenantAccess } from './tenant-access';

describe('toTenantAccess', () => {
  it('reads a manager answer', () => {
    expect(
      toTenantAccess({
        status: 'ACTIVE',
        operational: true,
        features: [
          { key: 'HOTSITE', tier: 'STANDARD' },
          { key: 'CHATBOT', tier: 'BASIC' },
        ],
      }),
    ).toEqual({ operational: true, features: ['HOTSITE', 'CHATBOT'] });
  });

  it('reads a staff answer, which has no status', () => {
    expect(toTenantAccess({ operational: false, features: [] })).toEqual({
      operational: false,
      features: [],
    });
  });

  it('ignores a feature key this build does not know, keeping the known ones', () => {
    expect(
      toTenantAccess({
        operational: true,
        features: [
          { key: 'HOTSITE', tier: 'STANDARD' },
          { key: 'BOGUS', tier: 'STANDARD' },
        ],
      } as never),
    ).toEqual({ operational: true, features: ['HOTSITE'] });
  });

  it('returns null for a customer answer, which carries no features', () => {
    expect(toTenantAccess({ operational: true })).toBeNull();
  });

  it('returns null for a malformed answer', () => {
    expect(toTenantAccess({ operational: 'yes', features: [] } as never)).toBeNull();
    expect(toTenantAccess({ operational: true, features: 'all' } as never)).toBeNull();
  });
});

describe('lockedFeaturesOf', () => {
  it('lists every feature the tenant does not hold', () => {
    expect(lockedFeaturesOf({ operational: true, features: ['HOTSITE', 'BOOKING'] })).toEqual([
      'LOYALTY',
      'CHATBOT',
      'LEAD_FORM',
    ]);
  });

  it('locks nothing when every feature is held', () => {
    expect(
      lockedFeaturesOf({
        operational: true,
        features: ['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'],
      }),
    ).toEqual([]);
  });

  it('locks every feature for a tenant that holds none (suspended)', () => {
    expect(lockedFeaturesOf({ operational: false, features: [] })).toHaveLength(5);
  });
});
