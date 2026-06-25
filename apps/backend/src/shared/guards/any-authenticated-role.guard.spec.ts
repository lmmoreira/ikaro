import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { AnyAuthenticatedRoleGuard } from './any-authenticated-role.guard';

function makeContext(actorRole: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-actor-role': actorRole } }),
    }),
  } as unknown as ExecutionContext;
}

describe('AnyAuthenticatedRoleGuard', () => {
  const guard = new AnyAuthenticatedRoleGuard();

  it('returns true when X-Actor-Role is CUSTOMER', () => {
    expect(guard.canActivate(makeContext('CUSTOMER'))).toBe(true);
  });

  it('returns true when X-Actor-Role is STAFF', () => {
    expect(guard.canActivate(makeContext('STAFF'))).toBe(true);
  });

  it('returns true when X-Actor-Role is MANAGER', () => {
    expect(guard.canActivate(makeContext('MANAGER'))).toBe(true);
  });

  it('throws 403 when X-Actor-Role header is absent (unauthenticated guest request)', () => {
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(HttpException);
    try {
      guard.canActivate(makeContext(undefined));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      const body = (e as HttpException).getResponse() as Record<string, unknown>;
      expect(body['title']).toBe('Forbidden');
      expect(body['detail']).toBe('Authenticated role required');
    }
  });

  it('throws 403 when X-Actor-Role is an unrecognised value', () => {
    expect(() => guard.canActivate(makeContext('ADMIN'))).toThrow(HttpException);
    try {
      guard.canActivate(makeContext('ADMIN'));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
  });
});
