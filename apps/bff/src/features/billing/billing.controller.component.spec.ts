import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MockBackendHttpService,
  MockHttpService,
  TENANT_ID,
  TENANT_ID_2,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeStaffJwt,
  request,
  setupActiveGuardMock,
} from '../../test/component-test.helpers';

const BACKEND_ANSWER = {
  status: 'SUSPENDED',
  suspensionReason: 'NON_PAYMENT',
  operational: false,
  features: [],
  provisional: true,
  degraded: true,
};

describe('BillingController (component)', () => {
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

  it('GET /v1/billing/access → 401 without a token', async () => {
    const res = await request(app.getHttpServer()).get('/v1/billing/access');

    expect(res.status).toBe(401);
  });

  it('GET /v1/billing/access → 200 for a MANAGER, with the status', async () => {
    setupActiveGuardMock(httpService);
    backendHttpService.get.mockResolvedValueOnce(BACKEND_ANSWER);

    const res = await request(app.getHttpServer())
      .get('/v1/billing/access')
      .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'SUSPENDED', operational: false, features: [] });
  });

  it('GET /v1/billing/access → 200 for STAFF, without the status', async () => {
    setupActiveGuardMock(httpService);
    backendHttpService.get.mockResolvedValueOnce(BACKEND_ANSWER);

    const res = await request(app.getHttpServer())
      .get('/v1/billing/access')
      .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ operational: false, features: [] });
  });

  it('GET /v1/billing/access → 200 for a CUSTOMER, operational only', async () => {
    backendHttpService.get.mockResolvedValueOnce(BACKEND_ANSWER);

    const res = await request(app.getHttpServer())
      .get('/v1/billing/access')
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ operational: false });
  });

  it.each([
    ['MANAGER', (jwt: JwtService) => makeManagerJwt(jwt), true],
    ['STAFF', (jwt: JwtService) => makeStaffJwt(jwt), true],
    ['CUSTOMER', (jwt: JwtService) => makeCustomerJwt(jwt), false],
  ])(
    'never puts the suspension reason or an internal marker on the wire for %s',
    async (_role, makeJwt, needsGuardMock) => {
      if (needsGuardMock) setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(BACKEND_ANSWER);

      const res = await request(app.getHttpServer())
        .get('/v1/billing/access')
        .set('Authorization', `Bearer ${makeJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.text).not.toContain('suspensionReason');
      expect(res.text).not.toContain('NON_PAYMENT');
      expect(res.text).not.toContain('provisional');
      expect(res.text).not.toContain('degraded');
    },
  );

  it('reads the tenant from the JWT only: a tenantId query parameter is ignored', async () => {
    setupActiveGuardMock(httpService);
    backendHttpService.get.mockResolvedValueOnce(BACKEND_ANSWER);

    await request(app.getHttpServer())
      .get(`/v1/billing/access?tenantId=${TENANT_ID_2}`)
      .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

    expect(backendHttpService.get).toHaveBeenCalledWith(
      `/internal/billing/tenants/${TENANT_ID}/access`,
    );
  });
});
