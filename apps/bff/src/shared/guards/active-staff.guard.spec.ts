import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { AuthErrorCode, BffErrorCode, StaffErrorCode } from '@ikaro/types';
import { makeExecutionContext } from '../../test/execution-context.factory';
import { ActiveStaffGuard } from './active-staff.guard';

const STAFF_ID = '30000000-0000-4000-8000-000000000001';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const INTERNAL_KEY = 'test-internal-key';

function makeHttp(isActive: boolean): HttpService {
  return {
    get: jest.fn().mockReturnValue(of({ data: { isActive } })),
  } as unknown as HttpService;
}

function makeConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'BACKEND_INTERNAL_URL') return 'http://backend:3001';
      if (key === 'INTERNAL_API_KEY') return INTERNAL_KEY;
      throw new Error(`Unexpected config key: ${key}`);
    }),
  } as unknown as ConfigService;
}

function makeGuard(http: HttpService, isPublic = false): ActiveStaffGuard {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
  return new ActiveStaffGuard(http, reflector, makeConfigService());
}

const activeUser = { sub: STAFF_ID, tenantId: TENANT_ID, tenantSlug: 'slug', role: 'MANAGER' };
const CTX_HEADERS = { 'x-correlation-id': 'test-corr' };

function ctx(user: unknown): ExecutionContext {
  return makeExecutionContext({ user, headers: CTX_HEADERS });
}

describe('ActiveStaffGuard', () => {
  it('returns true for @Public() routes without calling backend', async () => {
    const http = makeHttp(true);
    const guard = makeGuard(http, true);

    const result = await guard.canActivate(ctx(activeUser));

    expect(result).toBe(true);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('returns true for CUSTOMER role without calling backend', async () => {
    const http = makeHttp(true);
    const guard = makeGuard(http);
    const customerUser = { ...activeUser, role: 'CUSTOMER' };

    const result = await guard.canActivate(ctx(customerUser));

    expect(result).toBe(true);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('returns true for unauthenticated request (no user)', async () => {
    const http = makeHttp(true);
    const guard = makeGuard(http);

    const result = await guard.canActivate(ctx(undefined));

    expect(result).toBe(true);
    expect(http.get).not.toHaveBeenCalled();
  });

  it('returns true when backend reports isActive=true', async () => {
    const guard = makeGuard(makeHttp(true));

    const result = await guard.canActivate(ctx(activeUser));

    expect(result).toBe(true);
  });

  it('calls GET /staff/me/status — self-check, never GET /staff/:id', async () => {
    const http = makeHttp(true);
    const guard = makeGuard(http);

    await guard.canActivate(ctx(activeUser));

    const [url] = (http.get as jest.Mock).mock.calls[0] as [string];
    expect(url).toBe('http://backend:3001/staff/me/status');
  });

  it('includes X-Internal-Key in the backend request so InternalApiGuard lets it through', async () => {
    const http = makeHttp(true);
    const guard = makeGuard(http);

    await guard.canActivate(ctx(activeUser));

    const [, requestConfig] = (http.get as jest.Mock).mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(requestConfig.headers['X-Internal-Key']).toBe(INTERNAL_KEY);
  });

  it('applies for STAFF (non-manager) actors too — not just MANAGER', async () => {
    const http = makeHttp(true);
    const guard = makeGuard(http);
    const staffUser = { ...activeUser, role: 'STAFF' };

    const result = await guard.canActivate(ctx(staffUser));

    expect(result).toBe(true);
    expect(http.get).toHaveBeenCalled();
  });

  it('throws 403 with StaffErrorCode.DEACTIVATED when backend reports isActive=false', async () => {
    const guard = makeGuard(makeHttp(false));

    await expect(guard.canActivate(ctx(activeUser))).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(ctx(activeUser));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      const body = (e as HttpException).getResponse() as Record<string, unknown>;
      expect(body['status']).toBe(403);
      expect(body['code']).toBe(StaffErrorCode.DEACTIVATED);
    }
  });

  it('fails closed (401) when backend returns 404 — no hard-delete path exists, so a 404 on the caller’s own id means a stale/mismatched JWT', async () => {
    const http = {
      get: jest.fn().mockReturnValue(
        throwError(() => {
          const err = new AxiosError();
          err.response = { status: 404, data: { code: StaffErrorCode.NOT_FOUND } } as never;
          return err;
        }),
      ),
    } as unknown as HttpService;
    const guard = makeGuard(http);

    await expect(guard.canActivate(ctx(activeUser))).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(ctx(activeUser));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      const body = (e as HttpException).getResponse() as Record<string, unknown>;
      expect(body['code']).toBe(AuthErrorCode.UNAUTHORIZED);
    }
  });

  it('passes through the backend’s real code/detail for other backend error statuses', async () => {
    const backendBody = {
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'PLATFORM_SOMETHING_WENT_WRONG',
      detail: 'db unavailable',
    };
    const http = {
      get: jest.fn().mockReturnValue(
        throwError(() => {
          const err = new AxiosError();
          err.response = { status: 500, data: backendBody } as never;
          return err;
        }),
      ),
    } as unknown as HttpService;
    const guard = makeGuard(http);

    await expect(guard.canActivate(ctx(activeUser))).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(ctx(activeUser));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(500);
      expect((e as HttpException).getResponse()).toEqual(backendBody);
    }
  });

  it('throws 503 with BffErrorCode.UPSTREAM_UNAVAILABLE on a genuine network failure (no response at all)', async () => {
    const http = {
      get: jest.fn().mockReturnValue(
        throwError(() => {
          const err = new AxiosError('connect ECONNREFUSED');
          err.response = undefined;
          return err;
        }),
      ),
    } as unknown as HttpService;
    const guard = makeGuard(http);

    await expect(guard.canActivate(ctx(activeUser))).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(ctx(activeUser));
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      const body = (e as HttpException).getResponse() as Record<string, unknown>;
      expect(body['code']).toBe(BffErrorCode.UPSTREAM_UNAVAILABLE);
    }
  });
});
