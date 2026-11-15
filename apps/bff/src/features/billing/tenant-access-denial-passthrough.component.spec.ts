import { HttpException, INestApplication } from '@nestjs/common';
import { AxiosError } from 'axios';
import { JwtService } from '@nestjs/jwt';
import { BillingErrorCode } from '@ikaro/types';
import {
  MockBackendHttpService,
  MockHttpService,
  TENANT_ID,
  TENANT_ID_2,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeObservableError,
  makeObservableResponse,
  request,
  setupActiveGuardMock,
} from '../../test/component-test.helpers';

// M25-S33: the BFF holds no entitlement or suspension check. The backend guard is the only
// enforcement point, and the BFF forwards its typed denial to the web unchanged. The backend is
// faked at `BackendHttpService`, which turns a backend error response into an `HttpException` with
// the response's own body and status; the real guard chain and the real error filter run.
type Family = 'HOTSITE' | 'BOOKING' | 'LOYALTY' | 'CHATBOT' | 'LEAD_FORM';

interface FamilyRoute {
  family: Family;
  path: string;
  role: 'MANAGER' | 'CUSTOMER';
  /** The backend call that carries the denial and the body an entitled tenant gets back. */
  backendMethod: 'get';
  okBody: object;
}

const FAMILY_ROUTES: FamilyRoute[] = [
  {
    family: 'HOTSITE',
    path: '/v1/tenants/hotsite',
    role: 'MANAGER',
    backendMethod: 'get',
    okBody: { ok: 'hotsite' },
  },
  { family: 'BOOKING', path: '/v1/resources', role: 'MANAGER', backendMethod: 'get', okBody: [] },
  {
    family: 'LOYALTY',
    path: '/v1/loyalty/balance',
    role: 'CUSTOMER',
    backendMethod: 'get',
    okBody: { currentPoints: 0, nextExpiryDate: null, nextExpiryPoints: null, conversionRate: 1 },
  },
  {
    family: 'CHATBOT',
    path: '/v1/tenants/chatbot/cap-status',
    role: 'MANAGER',
    backendMethod: 'get',
    okBody: { ok: 'chatbot' },
  },
  {
    family: 'LEAD_FORM',
    path: '/v1/tenants/lead-form/config',
    role: 'MANAGER',
    backendMethod: 'get',
    okBody: { ok: 'lead-form' },
  },
];

const DENIALS = [
  {
    label: 'a tenant without the feature',
    code: BillingErrorCode.FEATURE_NOT_ENTITLED,
    detail: 'The tenant plan does not include this feature',
  },
  {
    label: 'a suspended tenant',
    code: BillingErrorCode.TENANT_SUSPENDED,
    detail: 'The tenant is suspended',
  },
] as const;

const denialBody = (code: string, detail: string) => ({
  type: 'about:blank',
  title: 'Forbidden',
  status: 403,
  code,
  detail,
});

// The BFF's error filter adds the request's `correlationId` to every error body and nothing else.
const withCorrelationId = (body: object): object => ({
  ...body,
  correlationId: expect.any(String),
});

describe('BFF tenant-access denial pass-through (component)', () => {
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

  const bearer = (route: FamilyRoute, tenantId = TENANT_ID): string =>
    `Bearer ${
      route.role === 'MANAGER'
        ? makeManagerJwt(jwtService, { tenantId })
        : makeCustomerJwt(jwtService, { tenantId })
    }`;

  const arrange = (route: FamilyRoute): void => {
    if (route.role === 'MANAGER') setupActiveGuardMock(httpService);
  };

  // No call, to the backend's own client or the active-staff guard's HTTP client, may ask for a
  // tenant's access answer: the BFF has nothing to decide with it.
  const accessLookups = (): unknown[] =>
    [...backendHttpService.get.mock.calls, ...httpService.get.mock.calls].filter(([url]) =>
      String(url).includes('/access'),
    );

  describe.each(DENIALS)('$label', ({ code, detail }) => {
    it.each(FAMILY_ROUTES)(
      'forwards the backend 403 $code on an authenticated $family route unchanged',
      async (route) => {
        arrange(route);
        const body = denialBody(code, detail);
        backendHttpService.get.mockRejectedValueOnce(new HttpException(body, 403));

        const res = await request(app.getHttpServer())
          .get(route.path)
          .set('Authorization', bearer(route));

        expect(res.status).toBe(403);
        expect(res.body).toEqual(withCorrelationId(body));
        expect(accessLookups()).toEqual([]);
      },
    );

    it('forwards it unchanged on a public slug route', async () => {
      backendHttpService.get.mockResolvedValueOnce({ id: TENANT_ID, slug: 'autospa', name: 'A' });
      const body = denialBody(code, detail);
      backendHttpService.getForPublic.mockRejectedValueOnce(new HttpException(body, 403));

      // The lead-form config is `PUBLIC_NONE` on the backend: both denials are real outcomes there,
      // unlike the manifest, whose `PUBLIC_MANIFEST` policy never refuses a suspended tenant.
      const res = await request(app.getHttpServer())
        .get('/v1/public/platform/lead-form/autospa')
        .set('X-Tenant-Slug', 'autospa');

      expect(res.status).toBe(403);
      expect(res.body).toEqual(withCorrelationId(body));
      expect(accessLookups()).toEqual([]);
    });
  });

  describe('an exempt tenant behaves exactly as before', () => {
    it.each(FAMILY_ROUTES)('serves a $family route with the backend answer', async (route) => {
      arrange(route);
      backendHttpService.get.mockResolvedValueOnce(route.okBody);

      const res = await request(app.getHttpServer())
        .get(route.path)
        .set('Authorization', bearer(route));

      expect(res.status).toBe(200);
      expect(res.body).toEqual(route.okBody);
      expect(accessLookups()).toEqual([]);
    });
  });

  describe('a suspended tenant keeps its own session routes', () => {
    it('answers GET /v1/auth/session for a manager', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce({ id: 's1', name: 'Ana' });

      const res = await request(app.getHttpServer())
        .get('/v1/auth/session')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body.staff).toEqual({ id: 's1', name: 'Ana' });
    });

    it('answers GET /v1/auth/session for a customer', async () => {
      backendHttpService.get.mockResolvedValueOnce({ customerId: 'c1', name: 'Bia' });

      const res = await request(app.getHttpServer())
        .get('/v1/auth/session')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body.customer).toEqual({ customerId: 'c1', name: 'Bia' });
    });

    it('answers GET /v1/billing/access with no BFF annotation, reading the backend answer', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce({
        status: 'SUSPENDED',
        operational: false,
        features: [],
      });

      const res = await request(app.getHttpServer())
        .get('/v1/billing/access')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'SUSPENDED', operational: false, features: [] });
    });

    it('lists the staff tenants and switches to one of them', async () => {
      const STAFF_ID_2 = '30000000-0000-4000-8000-000000000002';
      const staffRecord = {
        staffId: STAFF_ID_2,
        tenantId: TENANT_ID_2,
        role: 'STAFF',
        isActive: true,
      };
      const tenant = { id: TENANT_ID_2, slug: 'lavacar-sp', name: 'Lavacar SP' };

      setupActiveGuardMock(httpService);
      backendHttpService.get
        .mockResolvedValueOnce([staffRecord])
        .mockResolvedValueOnce([tenant])
        .mockResolvedValueOnce({ status: 'SUSPENDED', operational: false, features: [] });
      const list = await request(app.getHttpServer())
        .get('/v1/auth/staff-tenants')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce([staffRecord]).mockResolvedValueOnce(tenant);
      const switched = await request(app.getHttpServer())
        .post('/v1/auth/switch-staff-tenant')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ staffId: STAFF_ID_2 });

      expect(list.status).toBe(200);
      expect(list.body).toEqual([
        {
          staffId: STAFF_ID_2,
          tenantId: TENANT_ID_2,
          tenantSlug: 'lavacar-sp',
          tenantName: 'Lavacar SP',
          role: 'STAFF',
          operational: false,
        },
      ]);
      expect(switched.status).toBe(200);
      expect(switched.body.tenantSlug).toBe('lavacar-sp');
    });

    it('lists the customer tenants and switches to one of them', async () => {
      const tenants = [
        { tenantId: TENANT_ID, customerId: 'c1' },
        { tenantId: TENANT_ID_2, customerId: 'c2' },
      ];
      backendHttpService.get
        .mockResolvedValueOnce(tenants)
        .mockResolvedValueOnce([
          { id: TENANT_ID, slug: 'lavacar-bh', name: 'Lavacar BH' },
          { id: TENANT_ID_2, slug: 'lavacar-sp', name: 'Lavacar SP' },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({ status: 'ACTIVE', operational: true, features: [] })
        .mockResolvedValueOnce({ status: 'SUSPENDED', operational: false, features: [] });
      const list = await request(app.getHttpServer())
        .get('/v1/customers/tenants')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);

      backendHttpService.get
        .mockResolvedValueOnce(tenants)
        .mockResolvedValueOnce({ id: TENANT_ID_2, slug: 'lavacar-sp', name: 'Lavacar SP' });
      const switched = await request(app.getHttpServer())
        .post('/v1/auth/switch-tenant')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({ targetTenantId: TENANT_ID_2 });

      expect(list.status).toBe(200);
      expect(list.body.map((entry: { id: string }) => entry.id)).toEqual([TENANT_ID, TENANT_ID_2]);
      expect(list.body.map((entry: { operational: boolean }) => entry.operational)).toEqual([
        true,
        false,
      ]);
      expect(switched.status).toBe(200);
      expect(switched.body.tenantSlug).toBe('lavacar-sp');
    });

    it('starts the Google sign-in for a suspended tenant slug without any backend call', async () => {
      const res = await request(app.getHttpServer()).get('/v1/auth/google?tenantSlug=autospa');

      expect(res.status).toBeLessThan(400);
      expect(res.body.code).not.toBe(BillingErrorCode.TENANT_SUSPENDED);
      expect(backendHttpService.get).not.toHaveBeenCalled();
    });

    it('signs out without any tenant lookup', async () => {
      const res = await request(app.getHttpServer()).get('/v1/auth/logout?tenantSlug=autospa');

      expect(res.status).toBeLessThan(400);
      expect(backendHttpService.get).not.toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it('a public route sends the slug-resolved tenant id to the backend', async () => {
      backendHttpService.get.mockResolvedValueOnce({
        id: TENANT_ID_2,
        slug: 'other-tenant',
        name: 'B',
      });
      backendHttpService.getForPublic.mockResolvedValueOnce({ layout: [] });

      const res = await request(app.getHttpServer()).get(
        '/v1/public/platform/manifest/other-tenant',
      );

      expect(res.status).toBe(200);
      expect(backendHttpService.getForPublic).toHaveBeenCalledWith('/hotsite', TENANT_ID_2);
    });
  });
});

// The real request-scoped `BackendHttpService` over a mocked `HttpService`, so the headers the BFF
// forwards are visible: each caller's JWT tenant, and only that, becomes `X-Tenant-ID`.
describe('BFF tenant binding on the backend call (component)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let httpService: MockHttpService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, jwtService, httpService, restoreEnv } = await createTestApp({
      realBackendHttp: true,
    }));
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  const backendCallHeaders = (): Record<string, string> =>
    (httpService.get.mock.calls[0][1] as { headers: Record<string, string> }).headers;

  it("forwards each caller's own tenant, and a denial for tenant A never reaches tenant B", async () => {
    const denial = denialBody(BillingErrorCode.TENANT_SUSPENDED, 'The tenant is suspended');
    httpService.get.mockReturnValueOnce(
      makeObservableError(
        new AxiosError('forbidden', '403', undefined, undefined, {
          data: denial,
          status: 403,
          statusText: 'Forbidden',
          headers: {},
          config: {} as never,
        }),
      ),
    );
    const denied = await request(app.getHttpServer())
      .get('/v1/loyalty/balance')
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService, { tenantId: TENANT_ID })}`);
    expect(backendCallHeaders()['X-Tenant-ID']).toBe(TENANT_ID);
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual(withCorrelationId(denial));

    httpService.get.mockReset();
    httpService.get.mockReturnValueOnce(
      makeObservableResponse({
        currentPoints: 5,
        nextExpiryDate: null,
        nextExpiryPoints: null,
        conversionRate: 1,
      }),
    );
    const served = await request(app.getHttpServer())
      .get('/v1/loyalty/balance')
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService, { tenantId: TENANT_ID_2 })}`);

    expect(served.status).toBe(200);
    expect(backendCallHeaders()['X-Tenant-ID']).toBe(TENANT_ID_2);
  });
});
