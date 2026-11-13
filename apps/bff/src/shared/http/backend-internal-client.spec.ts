import { of } from 'rxjs';
import { makeRequest } from '../../test/execution-context.factory';
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
    const client = new BackendInternalClient(http, config);
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
});
