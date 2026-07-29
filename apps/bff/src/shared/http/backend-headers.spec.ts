import { makeRequest } from '../../test/execution-context.factory';
import { buildBackendHeaders } from './backend-headers';
import { GoogleProfile } from '../../features/auth/strategies/google.strategy';

describe('buildBackendHeaders()', () => {
  describe('base headers', () => {
    it('sets X-Tenant-ID to empty string when no authenticated user', () => {
      const headers = buildBackendHeaders(makeRequest());
      expect(headers['X-Tenant-ID']).toBe('');
    });

    it('omits X-Correlation-ID when header is absent so backend generates its own', () => {
      const headers = buildBackendHeaders(makeRequest());
      expect(headers['X-Correlation-ID']).toBeUndefined();
    });

    it('propagates X-Correlation-ID when present on the request', () => {
      const headers = buildBackendHeaders(
        makeRequest({ headers: { 'x-correlation-id': 'trace-abc-123' } }),
      );
      expect(headers['X-Correlation-ID']).toBe('trace-abc-123');
    });

    it('sets X-Tenant-ID from authenticated user tenantId', () => {
      const headers = buildBackendHeaders(
        makeRequest({ user: { sub: 'u1', tenantId: 'tenant-xyz', role: 'MANAGER' } }),
      );
      expect(headers['X-Tenant-ID']).toBe('tenant-xyz');
    });
  });

  describe('actor headers — absent for unauthenticated requests', () => {
    it('does not include X-Actor-* when no user', () => {
      const headers = buildBackendHeaders(makeRequest());
      expect(headers['X-Actor-ID']).toBeUndefined();
      expect(headers['X-Actor-Type']).toBeUndefined();
      expect(headers['X-Actor-Role']).toBeUndefined();
    });

    it('does not include X-Actor-* when user has no sub (GoogleProfile during OAuth callback)', () => {
      const googleProfile: GoogleProfile = {
        googleOAuthId: 'g-sub',
        email: 'a@b.com',
        name: 'A B',
      };
      const headers = buildBackendHeaders(makeRequest({ user: googleProfile }));
      expect(headers['X-Actor-ID']).toBeUndefined();
      expect(headers['X-Actor-Type']).toBeUndefined();
      expect(headers['X-Actor-Role']).toBeUndefined();
    });
  });

  describe('actor headers — present for authenticated requests', () => {
    it('sets X-Actor-ID to user.sub', () => {
      const headers = buildBackendHeaders(
        makeRequest({ user: { sub: 'staff-uuid-1', tenantId: 't1', role: 'STAFF' } }),
      );
      expect(headers['X-Actor-ID']).toBe('staff-uuid-1');
    });

    it('sets X-Actor-Type to STAFF and X-Actor-Role to STAFF for STAFF role', () => {
      const headers = buildBackendHeaders(
        makeRequest({ user: { sub: 'u1', tenantId: 't1', role: 'STAFF' } }),
      );
      expect(headers['X-Actor-Type']).toBe('STAFF');
      expect(headers['X-Actor-Role']).toBe('STAFF');
    });

    it('sets X-Actor-Type to STAFF and X-Actor-Role to MANAGER for MANAGER role', () => {
      const headers = buildBackendHeaders(
        makeRequest({ user: { sub: 'u1', tenantId: 't1', role: 'MANAGER' } }),
      );
      expect(headers['X-Actor-Type']).toBe('STAFF');
      expect(headers['X-Actor-Role']).toBe('MANAGER');
    });

    it('sets X-Actor-Type to CUSTOMER and X-Actor-Role to CUSTOMER for CUSTOMER role', () => {
      const headers = buildBackendHeaders(
        makeRequest({ user: { sub: 'u1', tenantId: 't1', role: 'CUSTOMER' } }),
      );
      expect(headers['X-Actor-Type']).toBe('CUSTOMER');
      expect(headers['X-Actor-Role']).toBe('CUSTOMER');
    });
  });
});
