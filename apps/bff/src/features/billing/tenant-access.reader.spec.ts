import { HttpException, HttpStatus } from '@nestjs/common';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { readOperationalByTenant, readTenantAccess } from './tenant-access.reader';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

const answer = (operational: boolean) => ({
  status: operational ? 'ACTIVE' : 'SUSPENDED',
  suspensionReason: 'NON_PAYMENT',
  operational,
  features: [],
});

function makeLogger(): { error: jest.Mock } {
  return { error: jest.fn() };
}

describe('readTenantAccess', () => {
  it('reads the backend internal access endpoint of the given tenant and strips the reason', async () => {
    const backendHttp = makeBackendHttp();
    backendHttp.get.mockResolvedValueOnce(answer(false));

    const access = await readTenantAccess(backendHttp, TENANT_A, makeLogger());

    expect(backendHttp.get).toHaveBeenCalledWith(`/internal/billing/tenants/${TENANT_A}/access`);
    expect(access).toEqual({ status: 'SUSPENDED', operational: false, features: [] });
    expect(access).not.toHaveProperty('suspensionReason');
  });

  it('fails open and logs on an outage', async () => {
    const backendHttp = makeBackendHttp();
    backendHttp.get.mockRejectedValueOnce(
      new HttpException('down', HttpStatus.SERVICE_UNAVAILABLE),
    );
    const logger = makeLogger();

    const access = await readTenantAccess(backendHttp, TENANT_A, logger);

    expect(access.operational).toBe(true);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('rethrows a 4xx, which is a real answer from the backend', async () => {
    const backendHttp = makeBackendHttp();
    backendHttp.get.mockRejectedValueOnce(new HttpException('nope', HttpStatus.NOT_FOUND));

    await expect(readTenantAccess(backendHttp, TENANT_A, makeLogger())).rejects.toThrow('nope');
  });
});

describe('readOperationalByTenant', () => {
  it('maps each tenant to its own operational flag, one read per distinct tenant', async () => {
    const backendHttp = makeBackendHttp();
    backendHttp.get.mockImplementation((url: string) =>
      Promise.resolve(answer(!url.includes(TENANT_B))),
    );

    const result = await readOperationalByTenant(
      backendHttp,
      [TENANT_A, TENANT_B, TENANT_A],
      makeLogger(),
    );

    expect(result.get(TENANT_A)).toBe(true);
    expect(result.get(TENANT_B)).toBe(false);
    expect(backendHttp.get).toHaveBeenCalledTimes(2);
  });
});
