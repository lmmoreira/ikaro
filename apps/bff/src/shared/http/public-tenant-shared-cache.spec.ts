import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import axios, { type InternalAxiosRequestConfig } from 'axios';
import { makeRequest } from '../../test/execution-context.factory';
import { InMemoryBffCache } from '../cache/in-memory-bff-cache';
import { BackendHttpService } from './backend-http.service';
import { BackendInternalClient } from './backend-internal-client';
import { tenantBySlugRead, withPublicTenant } from './public-tenant';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';

// The two real backend clients over one real cache, with only the network stubbed: the guard's
// singleton client and a controller's request-scoped one must share a single by-slug entry.
describe('public tenant read shared by the guard and withPublicTenant', () => {
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
      guardClient: new BackendInternalClient(http, config, cache),
      controllerClient: new BackendHttpService(http, config, req, cache),
      req,
    };
  }

  it('makes one by-slug call when the guard resolves the slug before the controller does', async () => {
    const { urls, guardClient, controllerClient, req } = makeClients();
    const { path, cache } = tenantBySlugRead('autospa');
    const run = jest.fn().mockResolvedValue('ok');

    await guardClient.get(path, req, { cache });
    await withPublicTenant(controllerClient, 'autospa', run);
    await withPublicTenant(controllerClient, 'autospa', run);

    expect(urls).toEqual(['http://backend:3001/internal/tenants/by-slug/autospa']);
    expect(run).toHaveBeenCalledWith(TENANT_ID);
  });
});
