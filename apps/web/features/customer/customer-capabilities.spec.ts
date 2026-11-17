import { describe, expect, it } from 'vitest';
import type { CustomerFeatureKey } from '@ikaro/types';
import {
  DEFAULT_CUSTOMER_TENANT_ACCESS,
  resolveCustomerCapabilities,
  type CustomerTenantAccess,
} from './customer-capabilities';

const ALL: readonly CustomerFeatureKey[] = ['BOOKING', 'LOYALTY'];

// Every state a tenant can be in, as the account sees it: operational or suspended, holding both
// features, one, none, or unknown (a failed read).
const FEATURE_STATES: readonly (readonly CustomerFeatureKey[] | null)[] = [
  ALL,
  ['BOOKING'],
  ['LOYALTY'],
  [],
  null,
];

describe('resolveCustomerCapabilities', () => {
  it('offers everything to an operational tenant that holds every feature (today’s account)', () => {
    expect(resolveCustomerCapabilities({ operational: true, entitledFeatures: ALL })).toEqual({
      showInactiveNotice: false,
      canStartBooking: true,
      newBookingMenu: 'offered',
      canRespondToInfoRequest: true,
      canReschedule: true,
      offersRecurringAndAlerts: true,
      canManageRecurring: true,
    });
  });

  it.each(FEATURE_STATES)(
    'a suspended tenant keeps every read and loses everything that creates or changes a booking (features %j)',
    (entitledFeatures) => {
      const capabilities = resolveCustomerCapabilities({ operational: false, entitledFeatures });

      expect(capabilities).toMatchObject({
        showInactiveNotice: true,
        canStartBooking: false,
        canRespondToInfoRequest: false,
        canReschedule: false,
        offersRecurringAndAlerts: false,
        canManageRecurring: false,
      });
    },
  );

  describe('the "+ Novo" menu has three states, never mixed', () => {
    it.each([
      ['an operational tenant that holds BOOKING', true, ['BOOKING'], 'offered'],
      ['an operational tenant that holds both', true, ALL, 'offered'],
      ['an operational tenant with unknown features (fail open)', true, null, 'offered'],
      ['an operational tenant without BOOKING', true, ['LOYALTY'], 'absent'],
      ['an operational tenant holding nothing', true, [], 'absent'],
      ['a suspended tenant that holds BOOKING', false, ['BOOKING'], 'disabled'],
      ['a suspended tenant with unknown features', false, null, 'disabled'],
      // A suspended tenant's access answer carries an empty list; the web reads it as unknown, but
      // even if one reached the resolver the menu must be absent only for a missing feature.
      ['a tenant without BOOKING that is also suspended', false, ['LOYALTY'], 'absent'],
    ] as const)('%s: %s', (_label, operational, entitledFeatures, expected) => {
      const access: CustomerTenantAccess = { operational, entitledFeatures };

      expect(resolveCustomerCapabilities(access).newBookingMenu).toBe(expected);
    });
  });

  it('does not change with LOYALTY: no capability here belongs to it', () => {
    const withLoyalty = resolveCustomerCapabilities({ operational: true, entitledFeatures: ALL });
    const withoutLoyalty = resolveCustomerCapabilities({
      operational: true,
      entitledFeatures: ['BOOKING'],
    });

    expect(withoutLoyalty).toEqual(withLoyalty);
  });
});

describe('DEFAULT_CUSTOMER_TENANT_ACCESS', () => {
  it('fails open: operational with every feature held, so an account without an answer behaves as today', () => {
    expect(DEFAULT_CUSTOMER_TENANT_ACCESS).toEqual({ operational: true, entitledFeatures: null });
    expect(resolveCustomerCapabilities(DEFAULT_CUSTOMER_TENANT_ACCESS).newBookingMenu).toBe(
      'offered',
    );
  });
});
