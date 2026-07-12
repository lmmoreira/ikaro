import { HttpException } from '@nestjs/common';
import { BffErrorCode } from '@ikaro/types';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { withPublicTenant } from './public-tenant';

describe('withPublicTenant', () => {
  afterEach(() => jest.resetAllMocks());

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
