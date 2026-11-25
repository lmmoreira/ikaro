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
import {
  BillingPlanBuilder,
  BillingPlanPreviewBuilder,
} from '../../test/builders/billing-plan.builder';
import {
  BillingChargeHistoryItemBuilder,
  BillingSummaryBuilder,
} from '../../test/builders/billing-summary.builder';

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

  it('GET /v1/billing/access → 200 for a CUSTOMER, operational and the customer-facing features', async () => {
    backendHttpService.get.mockResolvedValueOnce(BACKEND_ANSWER);

    const res = await request(app.getHttpServer())
      .get('/v1/billing/access')
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ operational: false, features: [] });
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

  describe('the plan reads (M26-S17)', () => {
    const HOTSITE = { featureKey: 'HOTSITE', tier: 'STANDARD' };
    const preview = (jwt: string, body: unknown) =>
      request(app.getHttpServer())
        .post('/v1/billing/plan/preview')
        .set('Authorization', `Bearer ${jwt}`)
        .send(body as object);

    it('GET /v1/billing/plan → 401 without a token, POST preview too', async () => {
      expect((await request(app.getHttpServer()).get('/v1/billing/plan')).status).toBe(401);
      expect(
        (await request(app.getHttpServer()).post('/v1/billing/plan/preview').send({ items: [] }))
          .status,
      ).toBe(401);
    });

    it.each(['STAFF', 'CUSTOMER'])(
      'GET plan and POST preview → 403 for %s, backend never called',
      async (role) => {
        setupActiveGuardMock(httpService);
        const jwt = role === 'STAFF' ? makeStaffJwt(jwtService) : makeCustomerJwt(jwtService);

        const read = await request(app.getHttpServer())
          .get('/v1/billing/plan')
          .set('Authorization', `Bearer ${jwt}`);
        const write = await preview(jwt, { items: [HOTSITE] });

        expect([read.status, write.status]).toEqual([403, 403]);
        expect(backendHttpService.get).not.toHaveBeenCalled();
        expect(backendHttpService.post).not.toHaveBeenCalled();
      },
    );

    it('GET /v1/billing/plan → 200 for a MANAGER with no undeclared field on the wire', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce({
        ...new BillingPlanBuilder().build(),
        internalNote: 'do not leak',
      });

      const res = await request(app.getHttpServer())
        .get('/v1/billing/plan')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ provisioning: false, countryCode: 'BR' });
      expect(res.text).not.toContain('internalNote');
      expect(backendHttpService.get).toHaveBeenCalledWith('/billing/plan');
    });

    it('POST /v1/billing/plan/preview → 200 with the items forwarded to the backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(new BillingPlanPreviewBuilder().build());

      const res = await preview(makeManagerJwt(jwtService), { items: [HOTSITE] });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        newTotalMinor: 4900,
        deferredBecauseNextInvoicePaid: false,
      });
      expect(backendHttpService.post).toHaveBeenCalledWith('/billing/plan/preview', {
        items: [HOTSITE],
      });
    });

    it.each([
      ['a duplicate featureKey', { items: [HOTSITE, HOTSITE] }],
      ['a tier not sold for the feature', { items: [{ featureKey: 'HOTSITE', tier: 'PLUS' }] }],
      ['an unknown feature', { items: [{ featureKey: 'NOPE', tier: 'STANDARD' }] }],
      ['no items field', {}],
    ])('POST /v1/billing/plan/preview → 400 for %s, backend never called', async (_label, body) => {
      setupActiveGuardMock(httpService);

      const res = await preview(makeManagerJwt(jwtService), body);

      expect(res.status).toBe(400);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('the manager reads (M26-S14)', () => {
    const PAGE = {
      items: [new BillingChargeHistoryItemBuilder().build()],
      pagination: { limit: 25, offset: 0, total: 1, hasMore: false },
    };

    it.each(['/v1/billing/summary', '/v1/billing/charges'])(
      'GET %s → 401 without a token',
      async (path) => {
        const res = await request(app.getHttpServer()).get(path);

        expect(res.status).toBe(401);
      },
    );

    it.each([
      ['/v1/billing/summary', 'STAFF'],
      ['/v1/billing/summary', 'CUSTOMER'],
      ['/v1/billing/charges', 'STAFF'],
      ['/v1/billing/charges', 'CUSTOMER'],
    ])('GET %s → 403 for %s, and the backend is never called', async (path, role) => {
      setupActiveGuardMock(httpService);
      const jwt = role === 'STAFF' ? makeStaffJwt(jwtService) : makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(403);
      expect(backendHttpService.get).not.toHaveBeenCalled();
    });

    it('GET /v1/billing/summary → 200 for a MANAGER, with no URL and no undeclared field on the wire', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce({
        ...new BillingSummaryBuilder().build(),
        internalNote: 'do not leak',
        openCharge: {
          ...new BillingSummaryBuilder().build().openCharge,
          paymentUrl: 'https://pay.example/leak',
        },
      });

      const res = await request(app.getHttpServer())
        .get('/v1/billing/summary')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ provisioning: false, status: 'ACTIVE', exempt: false });
      expect(res.text).not.toContain('https://pay.example/leak');
      expect(res.text).not.toContain('internalNote');
      expect(backendHttpService.get).toHaveBeenCalledWith('/billing/summary');
    });

    it('GET /v1/billing/summary → 200 provisioning for a tenant with no subscription row', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce({ provisioning: true });

      const res = await request(app.getHttpServer())
        .get('/v1/billing/summary')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ provisioning: true });
    });

    it('GET /v1/billing/charges → 200 with the page forwarded to the backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(PAGE);

      const res = await request(app.getHttpServer())
        .get('/v1/billing/charges?limit=10&offset=5')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(backendHttpService.get).toHaveBeenCalledWith('/billing/charges', {
        limit: 10,
        offset: 5,
      });
    });

    it.each(['limit=0', 'limit=101', 'limit=-1', 'offset=-1', 'limit=abc'])(
      'GET /v1/billing/charges?%s → 400 before the backend is called',
      async (query) => {
        setupActiveGuardMock(httpService);

        const res = await request(app.getHttpServer())
          .get(`/v1/billing/charges?${query}`)
          .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

        expect(res.status).toBe(400);
        expect(backendHttpService.get).not.toHaveBeenCalled();
      },
    );

    it('never takes the tenant from a parameter', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce({ provisioning: true });

      await request(app.getHttpServer())
        .get(`/v1/billing/summary?tenantId=${TENANT_ID_2}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(backendHttpService.get).toHaveBeenCalledWith('/billing/summary');
    });
  });
});
