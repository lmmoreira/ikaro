import { Request } from 'express';
import { buildBackendHeaders } from './backend-headers';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

function makeReq(user?: Partial<CurrentUserPayload>, correlationId?: string): Request {
  return {
    user,
    headers: correlationId ? { 'x-correlation-id': correlationId } : {},
  } as unknown as Request;
}

describe('buildBackendHeaders()', () => {
  describe('base headers', () => {
    it('sets X-Tenant-ID to empty string when no authenticated user', () => {
      const headers = buildBackendHeaders(makeReq(undefined));
      expect(headers['X-Tenant-ID']).toBe('');
    });

    it('omits X-Correlation-ID when header is absent so backend generates its own', () => {
      const headers = buildBackendHeaders(makeReq(undefined, undefined));
      expect(headers['X-Correlation-ID']).toBeUndefined();
    });

    it('propagates X-Correlation-ID when present on the request', () => {
      const headers = buildBackendHeaders(makeReq(undefined, 'trace-abc-123'));
      expect(headers['X-Correlation-ID']).toBe('trace-abc-123');
    });

    it('sets X-Tenant-ID from authenticated user tenantId', () => {
      const headers = buildBackendHeaders(
        makeReq({ sub: 'u1', tenantId: 'tenant-xyz', role: 'MANAGER' }),
      );
      expect(headers['X-Tenant-ID']).toBe('tenant-xyz');
    });
  });

  describe('actor headers — absent for unauthenticated requests', () => {
    it('does not include X-Actor-* when no user', () => {
      const headers = buildBackendHeaders(makeReq(undefined));
      expect(headers['X-Actor-ID']).toBeUndefined();
      expect(headers['X-Actor-Type']).toBeUndefined();
      expect(headers['X-Actor-Role']).toBeUndefined();
    });

    it('does not include X-Actor-* when user has no sub (GoogleProfile during OAuth callback)', () => {
      const headers = buildBackendHeaders(
        makeReq({
          googleOAuthId: 'g-sub',
          email: 'a@b.com',
        } as unknown as Partial<CurrentUserPayload>),
      );
      expect(headers['X-Actor-ID']).toBeUndefined();
      expect(headers['X-Actor-Type']).toBeUndefined();
      expect(headers['X-Actor-Role']).toBeUndefined();
    });
  });

  describe('actor headers — present for authenticated requests', () => {
    it('sets X-Actor-ID to user.sub', () => {
      const headers = buildBackendHeaders(
        makeReq({ sub: 'staff-uuid-1', tenantId: 't1', role: 'STAFF' }),
      );
      expect(headers['X-Actor-ID']).toBe('staff-uuid-1');
    });

    it('sets X-Actor-Type to STAFF and X-Actor-Role to STAFF for STAFF role', () => {
      const headers = buildBackendHeaders(makeReq({ sub: 'u1', tenantId: 't1', role: 'STAFF' }));
      expect(headers['X-Actor-Type']).toBe('STAFF');
      expect(headers['X-Actor-Role']).toBe('STAFF');
    });

    it('sets X-Actor-Type to STAFF and X-Actor-Role to MANAGER for MANAGER role', () => {
      const headers = buildBackendHeaders(makeReq({ sub: 'u1', tenantId: 't1', role: 'MANAGER' }));
      expect(headers['X-Actor-Type']).toBe('STAFF');
      expect(headers['X-Actor-Role']).toBe('MANAGER');
    });

    it('sets X-Actor-Type to CUSTOMER and X-Actor-Role to CUSTOMER for CUSTOMER role', () => {
      const headers = buildBackendHeaders(makeReq({ sub: 'u1', tenantId: 't1', role: 'CUSTOMER' }));
      expect(headers['X-Actor-Type']).toBe('CUSTOMER');
      expect(headers['X-Actor-Role']).toBe('CUSTOMER');
    });
  });
});
