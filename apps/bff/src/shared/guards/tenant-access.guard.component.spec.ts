import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MockBackendHttpService,
  MockHttpService,
  createTestApp,
  makeManagerJwt,
  makeObservableResponse,
  request,
  setupActiveGuardMock,
} from '../../test/component-test.helpers';

const EMPTY_LIST = {
  items: [],
  pagination: { limit: 50, offset: 0, total: 0, hasMore: false, nextOffset: null },
};

const SUSPENDED = {
  status: 'SUSPENDED',
  suspensionReason: 'NON_PAYMENT',
  operational: false,
  features: [],
};
const OPERATIONAL = {
  status: 'ACTIVE',
  suspensionReason: null,
  operational: true,
  features: [{ key: 'BOOKING', tier: 'STANDARD' }],
};

// The configured guard chain over real HTTP: `GET /v1/staff` declares no tenant-access metadata, so
// it is the default (entitlement-allowed, suspension-denied) route.
describe('TenantAccessGuard (component)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let httpService: MockHttpService;
  let backendHttpService: MockBackendHttpService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, jwtService, httpService, backendHttpService, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // The guard answers from the backend access route (`HttpService`), after `ActiveStaffGuard`'s own
  // status read; every test uses its own tenant so the per-instance access cache never carries over.
  const asTenant = (tenantId: string) => ({
    Authorization: `Bearer ${makeManagerJwt(jwtService, { tenantId })}`,
  });
  const answerAccess = (answer: object) =>
    httpService.get.mockReturnValueOnce(makeObservableResponse(answer));

  it('rejects a suspended tenant with a typed 403 before the controller runs', async () => {
    setupActiveGuardMock(httpService);
    answerAccess(SUSPENDED);

    const res = await request(app.getHttpServer())
      .get('/v1/staff')
      .set(asTenant('10000000-0000-4000-8000-0000000000a1'));

    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 403, code: 'BILLING_TENANT_SUSPENDED' });
    // The controller never executed for the rejected request.
    expect(backendHttpService.get).not.toHaveBeenCalled();
  });

  it('lets an operational tenant through to the controller', async () => {
    setupActiveGuardMock(httpService);
    answerAccess(OPERATIONAL);
    backendHttpService.get.mockResolvedValueOnce(EMPTY_LIST);

    const res = await request(app.getHttpServer())
      .get('/v1/staff')
      .set(asTenant('10000000-0000-4000-8000-0000000000a2'));

    expect(res.status).toBe(200);
    expect(backendHttpService.get).toHaveBeenCalledTimes(1);
  });

  it('keeps the active-staff error and makes no access lookup for a deactivated staff member', async () => {
    setupActiveGuardMock(httpService, false);

    const res = await request(app.getHttpServer())
      .get('/v1/staff')
      .set(asTenant('10000000-0000-4000-8000-0000000000a3'));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STAFF_DEACTIVATED');
    // Only ActiveStaffGuard's own status read happened: no access lookup, no controller.
    expect(httpService.get).toHaveBeenCalledTimes(1);
    expect(backendHttpService.get).not.toHaveBeenCalled();
  });

  it('serves the second request of a tenant from the cache, with no second access lookup', async () => {
    const tenantId = '10000000-0000-4000-8000-0000000000a4';
    setupActiveGuardMock(httpService);
    answerAccess(OPERATIONAL);
    backendHttpService.get.mockResolvedValue(EMPTY_LIST);

    await request(app.getHttpServer()).get('/v1/staff').set(asTenant(tenantId));
    setupActiveGuardMock(httpService);
    const second = await request(app.getHttpServer()).get('/v1/staff').set(asTenant(tenantId));

    expect(second.status).toBe(200);
    // Two ActiveStaffGuard status reads plus ONE access lookup.
    expect(httpService.get).toHaveBeenCalledTimes(3);
  });
});
