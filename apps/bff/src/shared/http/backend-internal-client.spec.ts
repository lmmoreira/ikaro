import { of } from 'rxjs';
import { makeRequest } from '../../test/execution-context.factory';
import { InMemoryBffCache } from '../cache/in-memory-bff-cache';
import {
  BackendInternalClient,
  type BackendClientConfig,
  type BackendGetClient,
} from './backend-internal-client';

const config: BackendClientConfig = {
  getOrThrow: (key) => (key === 'BACKEND_INTERNAL_URL' ? 'http://backend:3001' : 'internal-key'),
};

describe('BackendInternalClient', () => {
  it('calls the backend with the caller headers, the internal key and a timeout, and returns the body', async () => {
    const get = jest.fn().mockReturnValue(of({ data: { ok: true } }));
    const http: BackendGetClient = { get };
    const client = new BackendInternalClient(
      http,
      config,
      new InMemoryBffCache({ maxEntries: 10 }),
    );
    const req = makeRequest({ headers: { 'x-correlation-id': 'corr-1' } });

    const body = await client.get<{ ok: boolean }>('/staff/me/status', req);

    expect(body).toEqual({ ok: true });
    expect(get).toHaveBeenCalledWith(
      'http://backend:3001/staff/me/status',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Internal-Key': 'internal-key',
          'X-Correlation-ID': 'corr-1',
        }),
        timeout: 5_000,
      }),
    );
  });

  it('caches only a read that declares it, and shares the entry by key', async () => {
    const get = jest.fn().mockReturnValue(of({ data: { id: 'tenant-uuid' } }));
    const client = new BackendInternalClient(
      { get },
      config,
      new InMemoryBffCache({ maxEntries: 10 }),
    );
    const req = makeRequest({ headers: {} });
    const cache = { key: 'tenant-by-slug:autospa', ttlMs: 300_000 };

    await client.get('/by-slug/autospa', req, { cache });
    await client.get('/by-slug/autospa', req, { cache });
    await client.get('/other', req);
    await client.get('/other', req);

    expect(get).toHaveBeenCalledTimes(3);
  });
});
