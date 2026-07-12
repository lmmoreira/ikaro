import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthErrorCode } from '@ikaro/types';
import { makeExecutionContext } from '../../test/execution-context.factory';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const customer: CurrentUserPayload = {
    sub: 'uuid-1',
    tenantId: 'tenant-1',
    tenantSlug: 'slug-1',
    tenantName: 'Tenant 1',
    userName: 'Test User',
    role: 'CUSTOMER',
    locale: 'pt-BR',
  };
  const staff: CurrentUserPayload = { ...customer, role: 'STAFF' };
  const manager: CurrentUserPayload = { ...customer, role: 'MANAGER' };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('returns true when no @Roles() metadata is set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeExecutionContext({ user: customer }))).toBe(true);
  });

  it('returns true when @Roles() is empty', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    expect(guard.canActivate(makeExecutionContext({ user: customer }))).toBe(true);
  });

  it('returns true when user role matches required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['MANAGER']);
    expect(guard.canActivate(makeExecutionContext({ user: manager }))).toBe(true);
  });

  it('returns true when user role is one of multiple allowed roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['STAFF', 'MANAGER']);
    expect(guard.canActivate(makeExecutionContext({ user: staff }))).toBe(true);
  });

  it('throws 403 when STAFF tries to access a MANAGER-only endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['MANAGER']);
    expect(() => guard.canActivate(makeExecutionContext({ user: staff }))).toThrow(HttpException);
    try {
      guard.canActivate(makeExecutionContext({ user: staff }));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      const body = (e as HttpException).getResponse() as Record<string, unknown>;
      expect(body['status']).toBe(403);
      expect(body['code']).toBe(AuthErrorCode.FORBIDDEN);
    }
  });

  it('throws 403 when CUSTOMER tries to access a STAFF|MANAGER endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['STAFF', 'MANAGER']);
    expect(() => guard.canActivate(makeExecutionContext({ user: customer }))).toThrow(
      HttpException,
    );
  });

  it('throws 403 when no user is present', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['MANAGER']);
    expect(() => guard.canActivate(makeExecutionContext())).toThrow(HttpException);
  });
});
