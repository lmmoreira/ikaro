import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosResponse } from 'axios';
import { Request } from 'express';
import { throwError, of } from 'rxjs';
import { BackendHttpService } from './backend-http.service';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

const BACKEND_URL = 'http://backend:3001';
const INTERNAL_KEY = 'test-internal-key-test-internal-key';

function makeConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'BACKEND_INTERNAL_URL') return BACKEND_URL;
      if (key === 'INTERNAL_API_KEY') return INTERNAL_KEY;
      throw new Error(`Unknown config key: ${key}`);
    }),
  } as unknown as ConfigService;
}

function makeService(
  userOverride?: Partial<CurrentUserPayload>,
  correlationId = 'corr-xyz',
): {
  service: BackendHttpService;
  http: jest.Mocked<Pick<HttpService, 'get' | 'post' | 'patch' | 'delete'>>;
} {
  const http = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  } as jest.Mocked<Pick<HttpService, 'get' | 'post' | 'patch' | 'delete'>>;

  const user: CurrentUserPayload | undefined = userOverride
    ? {
        sub: 'user-1',
        tenantId: 'tenant-1',
        tenantSlug: 'slug-1',
        role: 'MANAGER',
        ...userOverride,
      }
    : undefined;

  const req = {
    user,
    headers: { 'x-correlation-id': correlationId },
  } as unknown as Request;

  const service = new BackendHttpService(http as unknown as HttpService, makeConfigService(), req);
  return { service, http };
}

function axiosOf<T>(data: T) {
  return of({ data } as AxiosResponse<T>);
}

describe('BackendHttpService', () => {
  describe('get()', () => {
    it('calls HttpService.get with correct URL, tenant and correlation headers', async () => {
      const { service, http } = makeService({ tenantId: 'tenant-abc' });
      http.get.mockReturnValue(axiosOf({ ok: true }));

      const result = await service.get('/health');

      expect(http.get).toHaveBeenCalledWith(
        'http://backend:3001/health',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Tenant-ID': 'tenant-abc',
            'X-Correlation-ID': 'corr-xyz',
          }),
          timeout: 10_000,
        }),
      );
      expect(result).toEqual({ ok: true });
    });

    it('forwards query params when provided', async () => {
      const { service, http } = makeService();
      http.get.mockReturnValue(axiosOf([]));

      await service.get('/customers', { page: 1 });

      expect(http.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: { page: 1 } }),
      );
    });
  });

  describe('post()', () => {
    it('calls HttpService.post with body and correct headers', async () => {
      const { service, http } = makeService({ tenantId: 'tenant-post' });
      http.post.mockReturnValue(axiosOf({ id: 'new-id' }));

      const result = await service.post('/bookings', { serviceId: 's1' });

      expect(http.post).toHaveBeenCalledWith(
        'http://backend:3001/bookings',
        { serviceId: 's1' },
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Tenant-ID': 'tenant-post' }),
        }),
      );
      expect(result).toEqual({ id: 'new-id' });
    });
  });

  describe('patch()', () => {
    it('calls HttpService.patch with correct URL and headers', async () => {
      const { service, http } = makeService({}, 'corr-patch');
      http.patch.mockReturnValue(axiosOf({ updated: true }));

      await service.patch('/bookings/b1/status', { status: 'APPROVED' });

      expect(http.patch).toHaveBeenCalledWith(
        'http://backend:3001/bookings/b1/status',
        { status: 'APPROVED' },
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Correlation-ID': 'corr-patch' }),
        }),
      );
    });
  });

  describe('delete()', () => {
    it('calls HttpService.delete with correct URL and headers', async () => {
      const { service, http } = makeService({ tenantId: 'tenant-del' });
      http.delete.mockReturnValue(axiosOf(undefined));

      await service.delete('/bookings/b1');

      expect(http.delete).toHaveBeenCalledWith(
        'http://backend:3001/bookings/b1',
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Tenant-ID': 'tenant-del' }),
        }),
      );
    });
  });

  describe('patchForPublic()', () => {
    it('calls HttpService.patch with X-Tenant-ID and X-Internal-Key (no actor headers)', async () => {
      const { service, http } = makeService({ tenantId: 'tid-actor' });
      http.patch.mockReturnValue(axiosOf({ updated: true }));

      await service.patchForPublic(
        '/bookings/b1/submit-info/guest',
        { response: 'ok' },
        'tid-guest',
      );

      expect(http.patch).toHaveBeenCalledWith(
        'http://backend:3001/bookings/b1/submit-info/guest',
        { response: 'ok' },
        expect.objectContaining({
          headers: { 'X-Tenant-ID': 'tid-guest', 'X-Internal-Key': INTERNAL_KEY },
          timeout: 10_000,
        }),
      );
    });
  });

  describe('error handling', () => {
    it('re-throws backend 4xx as HttpException with the original status and body', async () => {
      const { service, http } = makeService({ tenantId: 'tenant-1' });
      const axiosError = new AxiosError('Not Found', '404', undefined, undefined, {
        status: 404,
        data: { title: 'Not Found', status: 404 },
      } as AxiosResponse);
      http.get.mockReturnValue(throwError(() => axiosError));

      await expect(service.get('/missing')).rejects.toBeInstanceOf(HttpException);
      await expect(service.get('/missing')).rejects.toMatchObject({ status: 404 });
    });

    it('re-throws non-Axios errors as-is', async () => {
      const { service, http } = makeService({ tenantId: 'tenant-1' });
      const networkError = new Error('ECONNREFUSED');
      http.get.mockReturnValue(throwError(() => networkError));

      await expect(service.get('/down')).rejects.toBe(networkError);
    });
  });

  describe('headers()', () => {
    it('includes X-Internal-Key on every call regardless of auth state', async () => {
      const { service, http } = makeService(undefined);
      http.get.mockReturnValue(axiosOf({}));

      await service.get('/public');

      expect(http.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Internal-Key': INTERNAL_KEY }),
        }),
      );
    });

    it('uses empty string for X-Tenant-ID when no authenticated user', async () => {
      const { service, http } = makeService(undefined);
      http.get.mockReturnValue(axiosOf({}));

      await service.get('/public');

      expect(http.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Tenant-ID': '' }),
        }),
      );
    });

    it('omits X-Correlation-ID when header is absent so backend generates its own', async () => {
      const http = { get: jest.fn() } as jest.Mocked<Pick<HttpService, 'get'>>;
      const req = { user: undefined, headers: {} } as unknown as Request;
      const service = new BackendHttpService(
        http as unknown as HttpService,
        makeConfigService(),
        req,
      );
      http.get.mockReturnValue(axiosOf({}));

      await service.get('/public');

      const callHeaders = (http.get as jest.Mock).mock.calls[0][1].headers as Record<
        string,
        string
      >;
      expect(callHeaders['X-Correlation-ID']).toBeUndefined();
    });

    it('includes X-Actor-ID, X-Actor-Type, X-Actor-Role for authenticated requests', async () => {
      const { service, http } = makeService({
        sub: 'staff-uuid-1',
        role: 'STAFF',
        tenantId: 'tid',
      });
      http.get.mockReturnValue(axiosOf({}));

      await service.get('/bookings');

      expect(http.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Actor-ID': 'staff-uuid-1',
            'X-Actor-Type': 'STAFF',
            'X-Actor-Role': 'STAFF',
          }),
        }),
      );
    });

    it('sets X-Actor-Type to CUSTOMER for CUSTOMER role', async () => {
      const { service, http } = makeService({ sub: 'customer-uuid-1', role: 'CUSTOMER' });
      http.get.mockReturnValue(axiosOf({}));

      await service.get('/me');

      expect(http.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Actor-Type': 'CUSTOMER' }),
        }),
      );
    });

    it('sets X-Actor-Type to STAFF for MANAGER role', async () => {
      const { service, http } = makeService({ sub: 'manager-uuid-1', role: 'MANAGER' });
      http.get.mockReturnValue(axiosOf({}));

      await service.get('/settings');

      expect(http.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Actor-Type': 'STAFF', 'X-Actor-Role': 'MANAGER' }),
        }),
      );
    });

    it('does not include X-Actor-* headers when req.user is a GoogleProfile (OAuth callback)', async () => {
      const http = { get: jest.fn() } as jest.Mocked<Pick<HttpService, 'get'>>;
      // GoogleProfile has no sub/role — simulates the OAuth callback state
      const req = {
        user: { googleOAuthId: 'google-sub-1', email: 'a@b.com', name: 'A' },
        headers: { 'x-correlation-id': 'corr-1' },
      } as unknown as Request;
      const service = new BackendHttpService(
        http as unknown as HttpService,
        makeConfigService(),
        req,
      );
      http.get.mockReturnValue(axiosOf({}));

      await service.get('/internal/customers/tenants');

      const callArgs = (http.get as jest.Mock).mock.calls[0][1] as {
        headers: Record<string, string>;
      };
      expect(callArgs.headers['X-Actor-ID']).toBeUndefined();
      expect(callArgs.headers['X-Actor-Type']).toBeUndefined();
      expect(callArgs.headers['X-Actor-Role']).toBeUndefined();
    });

    it('does not include X-Actor-* headers for guest requests (no user)', async () => {
      const { service, http } = makeService(undefined);
      http.get.mockReturnValue(axiosOf({}));

      await service.get('/public');

      const callArgs = (http.get as jest.Mock).mock.calls[0][1] as {
        headers: Record<string, string>;
      };
      expect(callArgs.headers['X-Actor-ID']).toBeUndefined();
      expect(callArgs.headers['X-Actor-Type']).toBeUndefined();
      expect(callArgs.headers['X-Actor-Role']).toBeUndefined();
    });
  });
});
