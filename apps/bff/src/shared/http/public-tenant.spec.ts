import { HttpException } from '@nestjs/common';
import { BffErrorCode } from '@ikaro/types';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { publicTenantCache, withPublicTenant } from './public-tenant';

describe('withPublicTenant', () => {
  afterEach(() => {
    jest.resetAllMocks();
    publicTenantCache.clear();
  });

  it('resolves a slug once and serves the next request from the shared cache', async () => {
    const backendHttp = makeBackendHttp({
      get: jest.fn().mockResolvedValue({ id: 'tenant-uuid', slug: 'cached', name: 'Cached' }),
    });
    const run = jest.fn().mockResolvedValue('ok');

    await withPublicTenant(backendHttp, 'cached', run);
    await withPublicTenant(backendHttp, 'cached', run);

    expect(backendHttp.get).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith('tenant-uuid');
  });

  it('does not cache a failed lookup', async () => {
    const backendHttp = makeBackendHttp({
      get: jest
        .fn()
        .mockRejectedValueOnce(new Error('not found'))
        .mockResolvedValueOnce({ id: 'tenant-uuid', slug: 'later', name: 'Later' }),
    });
    const run = jest.fn().mockResolvedValue('ok');

    await expect(withPublicTenant(backendHttp, 'later', run)).rejects.toThrow('not found');
    await withPublicTenant(backendHttp, 'later', run);

    expect(backendHttp.get).toHaveBeenCalledTimes(2);
  });

  it('throws 400 with BffErrorCode.TENANT_SLUG_HEADER_REQUIRED when tenant slug is missing', async () => {
    const backendHttp = makeBackendHttp();

    const err = await withPublicTenant(backendHttp, undefined, jest.fn()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(400);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: BffErrorCode.TENANT_SLUG_HEADER_REQUIRED,
    });
  });

  it('resolves tenant id from slug and passes it to the callback', async () => {
    const backendHttp = makeBackendHttp({
      get: jest.fn().mockResolvedValue({
        id: 'tenant-uuid',
        slug: 'lavacar-bh',
        name: 'Lavacar BH',
      }),
    });
    const run = jest.fn().mockResolvedValue('ok');

    const result = await withPublicTenant(backendHttp, 'lavacar-bh', run);

    expect(backendHttp.get).toHaveBeenCalledWith('/internal/tenants/by-slug/lavacar-bh');
    expect(run).toHaveBeenCalledWith('tenant-uuid');
    expect(result).toBe('ok');
  });

  it('encodes reserved characters in the tenant slug before lookup', async () => {
    const backendHttp = makeBackendHttp({
      get: jest.fn().mockResolvedValue({
        id: 'tenant-uuid',
        slug: 'lavacar/bh?x=1',
        name: 'Lavacar BH',
      }),
    });

    await withPublicTenant(backendHttp, 'lavacar/bh?x=1', jest.fn());

    expect(backendHttp.get).toHaveBeenCalledWith('/internal/tenants/by-slug/lavacar%2Fbh%3Fx%3D1');
  });

  it('propagates backend errors when tenant lookup fails', async () => {
    const backendHttp = makeBackendHttp({
      get: jest.fn().mockRejectedValue(new Error('backend down')),
    });

    await expect(withPublicTenant(backendHttp, 'lavacar-bh', jest.fn())).rejects.toThrow(
      'backend down',
    );
  });
});
