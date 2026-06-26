import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { makeExecutionContext } from '../../test/execution-context.factory';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let reflector: Reflector;

  const user: CurrentUserPayload = {
    sub: 'uuid-1',
    tenantId: 'tenant-uuid-1',
    tenantSlug: 'lavacar-belo',
    tenantName: 'Lavacar Belo',
    userName: 'Test User',
    role: 'CUSTOMER',
    locale: 'pt-BR',
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new TenantGuard(reflector);
  });

  it('returns true for @Public() routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    expect(guard.canActivate(makeExecutionContext())).toBe(true);
  });

  it('returns true when no user is present (guard did not run — handled by JwtAuthGuard)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    expect(guard.canActivate(makeExecutionContext())).toBe(true);
  });

  it('returns true when X-Tenant-Slug is absent', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    expect(guard.canActivate(makeExecutionContext({ user }))).toBe(true);
  });

  it('returns true when X-Tenant-Slug matches JWT tenantSlug', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    expect(
      guard.canActivate(
        makeExecutionContext({ user, headers: { 'x-tenant-slug': 'lavacar-belo' } }),
      ),
    ).toBe(true);
  });

  it('throws 403 when X-Tenant-Slug does not match JWT tenantSlug', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    expect(() =>
      guard.canActivate(
        makeExecutionContext({ user, headers: { 'x-tenant-slug': 'other-tenant' } }),
      ),
    ).toThrow(HttpException);
    try {
      guard.canActivate(
        makeExecutionContext({ user, headers: { 'x-tenant-slug': 'other-tenant' } }),
      );
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      const body = (e as HttpException).getResponse() as Record<string, unknown>;
      expect(body['status']).toBe(403);
    }
  });
});
