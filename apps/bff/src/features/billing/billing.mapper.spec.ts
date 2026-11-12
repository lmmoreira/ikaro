import { toBillingAccessResponse } from './billing.mapper';
import type { BackendTenantAccess } from './billing.types';

const ACCESS: BackendTenantAccess = {
  status: 'PAST_DUE',
  operational: true,
  features: [
    { key: 'HOTSITE', tier: 'STANDARD' },
    { key: 'CHATBOT', tier: 'BASIC' },
  ],
};

describe('toBillingAccessResponse', () => {
  it('gives a MANAGER the status, operational flag and features', () => {
    expect(toBillingAccessResponse('MANAGER', ACCESS)).toEqual({
      status: 'PAST_DUE',
      operational: true,
      features: ACCESS.features,
    });
  });

  it('gives STAFF the operational flag and features, never the status', () => {
    const view = toBillingAccessResponse('STAFF', ACCESS);

    expect(view).toEqual({ operational: true, features: ACCESS.features });
    expect(view).not.toHaveProperty('status');
  });

  it('gives a CUSTOMER only whether the tenant is operational', () => {
    expect(toBillingAccessResponse('CUSTOMER', ACCESS)).toEqual({ operational: true });
  });

  it.each(['MANAGER', 'STAFF', 'CUSTOMER'] as const)(
    'never carries a suspension reason or an internal marker for %s, even when the input does',
    (role) => {
      // What the backend really sends for a suspended tenant, markers and reason included.
      const backendAnswer = {
        status: 'SUSPENDED',
        suspensionReason: 'NON_PAYMENT',
        operational: false,
        features: [],
        provisional: true,
        degraded: true,
      } as unknown as BackendTenantAccess;

      const serialized = JSON.stringify(toBillingAccessResponse(role, backendAnswer));

      expect(serialized).not.toContain('suspensionReason');
      expect(serialized).not.toContain('NON_PAYMENT');
      expect(serialized).not.toContain('provisional');
      expect(serialized).not.toContain('degraded');
    },
  );
});
