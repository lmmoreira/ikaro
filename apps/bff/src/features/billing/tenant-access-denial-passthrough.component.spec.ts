import { HttpException, INestApplication } from '@nestjs/common';
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
        expect(res.body.code).toBe(code);
        expect(res.body).toMatchObject({ status: 403, detail });
        expect(accessLookups()).toEqual([]);
      },
    );

    it('forwards it unchanged on a public slug route', async () => {
      backendHttpService.get.mockResolvedValueOnce({ id: TENANT_ID, slug: 'autospa', name: 'A' });
      backendHttpService.getForPublic.mockRejectedValueOnce(
        new HttpException(denialBody(code, detail), 403),
      );

      const res = await request(app.getHttpServer()).get('/v1/public/platform/manifest/autospa');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(code);
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

    it('signs out without any tenant lookup', async () => {
      const res = await request(app.getHttpServer()).get('/v1/auth/logout?tenantSlug=autospa');

      expect(res.status).toBeLessThan(400);
      expect(backendHttpService.get).not.toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it('a denial for tenant A never reaches tenant B, which is served normally', async () => {
      const [routeA] = FAMILY_ROUTES;
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException(
          denialBody(BillingErrorCode.TENANT_SUSPENDED, 'The tenant is suspended'),
          403,
        ),
      );
      const denied = await request(app.getHttpServer())
        .get(routeA.path)
        .set('Authorization', bearer(routeA, TENANT_ID));

      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(routeA.okBody);
      const served = await request(app.getHttpServer())
        .get(routeA.path)
        .set('Authorization', bearer(routeA, TENANT_ID_2));

      expect(denied.status).toBe(403);
      expect(served.status).toBe(200);
    });

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
