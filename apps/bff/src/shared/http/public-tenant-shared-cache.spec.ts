import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import axios, { type InternalAxiosRequestConfig } from 'axios';
import { makeRequest } from '../../test/execution-context.factory';
import { InMemoryBffCache } from '../cache/in-memory-bff-cache';
import { BackendHttpService } from './backend-http.service';
import { resolvePublicTenantViaBackend, withPublicTenant } from './public-tenant';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';

// Two real request-scoped backend clients over one real cache, with only the network stubbed:
// `withPublicTenant` (every public route) and the hotsite manifest read must share a single by-slug
// entry per slug.
describe('public tenant read shared by withPublicTenant and the hotsite manifest', () => {
  const config = new ConfigService({
    BACKEND_INTERNAL_URL: 'http://backend:3001',
    INTERNAL_API_KEY: 'internal-key',
  });

  function makeClients() {
    const urls: string[] = [];
    const axiosInstance = axios.create({
      adapter: (request: InternalAxiosRequestConfig) => {
        urls.push(request.url ?? '');
        return Promise.resolve({
          data: { id: TENANT_ID, slug: 'autospa', name: 'Autospa' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: request,
        });
      },
    });
    const http = new HttpService(axiosInstance);
    const cache = new InMemoryBffCache<unknown>({ maxEntries: 10 });
    const req = makeRequest({ headers: {} });
    return {
      urls,
      manifestClient: new BackendHttpService(http, config, req, cache),
      controllerClient: new BackendHttpService(http, config, req, cache),
    };
  }

  it('makes one by-slug call when the manifest resolves the slug before a public route does', async () => {
    const { urls, manifestClient, controllerClient } = makeClients();
    const run = jest.fn().mockResolvedValue('ok');

    await resolvePublicTenantViaBackend(manifestClient, 'autospa');
    await withPublicTenant(controllerClient, 'autospa', run);
    await withPublicTenant(controllerClient, 'autospa', run);

    expect(urls).toEqual(['http://backend:3001/internal/tenants/by-slug/autospa']);
    expect(run).toHaveBeenCalledWith(TENANT_ID);
  });
});
