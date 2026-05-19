import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { ActiveStaffGuard } from './active-staff.guard';

const STAFF_ID = '30000000-0000-4000-8000-000000000001';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';

function makeContext(user: unknown, isPublic = false): ExecutionContext {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        headers: { 'x-correlation-id': 'test-corr' },
      }),
    }),
  } as unknown as ExecutionContext;
}

function makeHttp(isActive: boolean): HttpService {
  return {
    get: jest
      .fn()
      .mockReturnValue(of({ data: { isActive, id: STAFF_ID, email: 'g@g.com', role: 'MANAGER' } })),
  } as unknown as HttpService;
}

function makeGuard(http: HttpService, isPublic = false): ActiveStaffGuard {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
  return new ActiveStaffGuard(http, reflector);
}

const activeUser = { sub: STAFF_ID, tenantId: TENANT_ID, tenantSlug: 'slug', role: 'MANAGER' };

describe('ActiveStaffGuard', () => {
  it('returns true for @Public() routes without calling backend', async () => {
    const http = makeHttp(true);
    const guard = makeGuard(http, true);

    const result = await guard.canActivate(makeContext(activeUser, true));

    expect(result).toBe(true);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('returns true for CUSTOMER role without calling backend', async () => {
    const http = makeHttp(true);
    const guard = makeGuard(http);
    const customerUser = { ...activeUser, role: 'CUSTOMER' };

    const result = await guard.canActivate(makeContext(customerUser));

    expect(result).toBe(true);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('returns true for unauthenticated request (no user)', async () => {
    const http = makeHttp(true);
    const guard = makeGuard(http);

    const result = await guard.canActivate(makeContext(undefined));

    expect(result).toBe(true);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('returns true when backend reports isActive=true', async () => {
    const guard = makeGuard(makeHttp(true));

    const result = await guard.canActivate(makeContext(activeUser));

    expect(result).toBe(true);
  });

  it('throws 403 when backend reports isActive=false', async () => {
    const guard = makeGuard(makeHttp(false));

    await expect(guard.canActivate(makeContext(activeUser))).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(makeContext(activeUser));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      const body = (e as HttpException).getResponse() as Record<string, unknown>;
      expect(body['status']).toBe(403);
    }
  });

  it('returns true when backend returns 404 (staff not found — allow, backend will re-check)', async () => {
    const http = {
      get: jest.fn().mockReturnValue(
        throwError(() => {
          const err = new AxiosError();
          err.response = { status: 404 } as never;
          return err;
        }),
      ),
    } as unknown as HttpService;
    const guard = makeGuard(http);

    const result = await guard.canActivate(makeContext(activeUser));

    expect(result).toBe(true);
  });

  it('throws 503 for non-404 backend Axios errors', async () => {
    const http = {
      get: jest.fn().mockReturnValue(
        throwError(() => {
          const err = new AxiosError();
          err.response = { status: 500 } as never;
          return err;
        }),
      ),
    } as unknown as HttpService;
    const guard = makeGuard(http);

    await expect(guard.canActivate(makeContext(activeUser))).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(makeContext(activeUser));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    }
  });
});
