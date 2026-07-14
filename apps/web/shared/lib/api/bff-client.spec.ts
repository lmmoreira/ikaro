import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, AuthError, ForbiddenError } from './errors';
import { bffClient } from './bff-client';

const mock = new MockAdapter(bffClient);

beforeEach(() => {
  mock.reset();
});

afterEach(() => {
  mock.reset();
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

  it('carries the response body on ForbiddenError.data', async () => {
    mock.onGet('/secure').reply(403, { detail: 'Forbidden', code: 'STAFF_SELF_DEACTIVATION' });
    const err = await bffClient.get('/secure').catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as ForbiddenError).data).toEqual({
      detail: 'Forbidden',
      code: 'STAFF_SELF_DEACTIVATION',
    });
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
