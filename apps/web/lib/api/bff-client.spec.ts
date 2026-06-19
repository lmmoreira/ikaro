import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, AuthError, ForbiddenError } from './errors';
import { bffClient, configureBffClient, getTenantId } from './bff-client';

const mock = new MockAdapter(bffClient);

function resetClient() {
  configureBffClient({ token: '', tenantSlug: '', tenantId: '' });
}

beforeEach(() => {
  resetClient();
  mock.reset();
});

afterEach(() => {
  resetClient();
});

describe('configureBffClient / getTenantId', () => {
  it('stores tenantId and returns it via getTenantId', () => {
    configureBffClient({ token: 'tok', tenantSlug: 'slug', tenantId: 'tid-1' });
    expect(getTenantId()).toBe('tid-1');
  });

  it('returns empty string before configuration', () => {
    expect(getTenantId()).toBe('');
  });
});

describe('request interceptor', () => {
  it('adds Authorization and X-Tenant-Slug headers when configured', async () => {
    configureBffClient({ token: 'jwt-abc', tenantSlug: 'acme', tenantId: 'tid' });

    let capturedHeaders: Record<string, string> = {};
    mock.onGet('/ping').reply((config) => {
      capturedHeaders = (config.headers ?? {}) as Record<string, string>;
      return [200, {}];
    });

    await bffClient.get('/ping');

    expect(capturedHeaders['Authorization']).toBe('Bearer jwt-abc');
    expect(capturedHeaders['X-Tenant-Slug']).toBe('acme');
  });

  it('does not add Authorization or X-Tenant-Slug when not configured', async () => {
    let capturedHeaders: Record<string, string> = {};
    mock.onGet('/ping').reply((config) => {
      capturedHeaders = (config.headers ?? {}) as Record<string, string>;
      return [200, {}];
    });

    await bffClient.get('/ping');

    expect(capturedHeaders['Authorization']).toBeUndefined();
    expect(capturedHeaders['X-Tenant-Slug']).toBeUndefined();
  });
});

describe('response interceptor — error mapping', () => {
  it('maps 401 to AuthError', async () => {
    mock.onGet('/secure').reply(401, { detail: 'Unauthorized' });
    await expect(bffClient.get('/secure')).rejects.toBeInstanceOf(AuthError);
  });

  it('maps 403 to ForbiddenError', async () => {
    mock.onGet('/secure').reply(403, { detail: 'Forbidden' });
    await expect(bffClient.get('/secure')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('maps 422 to ApiError with correct status and detail', async () => {
    mock.onGet('/data').reply(422, { detail: 'Unprocessable' });
    const err = await bffClient.get('/data').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(422);
    expect((err as ApiError).detail).toBe('Unprocessable');
  });

  it('maps 500 to ApiError', async () => {
    mock.onGet('/data').reply(500, { detail: 'Server error' });
    await expect(bffClient.get('/data')).rejects.toBeInstanceOf(ApiError);
  });

  it('uses err.message as detail when response has no detail field', async () => {
    mock.onGet('/data').reply(500, {});
    const err = await bffClient.get('/data').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(typeof (err as ApiError).detail).toBe('string');
  });
});
