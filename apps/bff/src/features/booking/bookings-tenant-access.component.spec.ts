import { HttpStatus, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import { BillingErrorCode } from '@ikaro/types';
import { throwProblemDetail } from '../../shared/http/problem-detail';
import {
  MockBackendHttpService,
  MockHttpService,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeObservableResponse,
  request,
} from '../../test/component-test.helpers';

type Method = 'get' | 'post' | 'patch';
type Role = 'CUSTOMER' | 'MANAGER' | 'STAFF';

interface BookingRoute {
  method: Method;
  /** The path under `/v1`. */
  path: string;
  /** `CUSTOMER`/`MANAGER`/`STAFF` → a JWT caller; omitted → a guest route naming its tenant by slug. */
  role?: Role;
}

const SOME_ID = '40000000-0000-4000-8000-000000000042';

// Every BFF booking route the guard can decide for (the tenant comes from the JWT, or from the
// `X-Tenant-Slug` header of the one public route that carries it). The three token-based public
// routes are covered separately below: the guard has no tenant to resolve for them.
const ROUTES: BookingRoute[] = [
  { method: 'get', path: '/v1/bookings', role: 'CUSTOMER' },
  { method: 'get', path: `/v1/bookings/${SOME_ID}`, role: 'CUSTOMER' },
  { method: 'post', path: '/v1/bookings' },
  { method: 'post', path: '/v1/bookings/authenticated', role: 'CUSTOMER' },
  { method: 'post', path: '/v1/bookings/staff', role: 'MANAGER' },
  { method: 'patch', path: `/v1/bookings/${SOME_ID}/cancel`, role: 'CUSTOMER' },
  { method: 'patch', path: `/v1/bookings/${SOME_ID}/approve`, role: 'MANAGER' },
  { method: 'patch', path: `/v1/bookings/${SOME_ID}/reschedule`, role: 'CUSTOMER' },
  { method: 'patch', path: `/v1/bookings/${SOME_ID}/complete`, role: 'MANAGER' },
  { method: 'patch', path: `/v1/bookings/${SOME_ID}/reject`, role: 'MANAGER' },
  { method: 'patch', path: `/v1/bookings/${SOME_ID}/request-info`, role: 'MANAGER' },
  { method: 'patch', path: `/v1/bookings/${SOME_ID}/submit-info`, role: 'CUSTOMER' },
  { method: 'post', path: `/v1/bookings/${SOME_ID}/no-show`, role: 'MANAGER' },
  { method: 'post', path: `/v1/bookings/${SOME_ID}/no-show/correct`, role: 'MANAGER' },
];

// UC-121: the customer's list and the cancel of a future booking stay reachable while suspended.
const HISTORY_ROUTES = new Set(['get /v1/bookings', `patch /v1/bookings/${SOME_ID}/cancel`]);
const routeKey = (route: BookingRoute) => `${route.method} ${route.path}`;
const SUSPENDED_ROUTES = ROUTES.filter((route) => !HISTORY_ROUTES.has(routeKey(route)));

const ALL_FEATURES = ['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'] as const;
const features = (keys: readonly string[]) => keys.map((key) => ({ key, tier: 'STANDARD' }));

const SUSPENDED = { operational: false, features: [] };
const ENTITLED = { operational: true, features: features(ALL_FEATURES) };
const WITHOUT_BOOKING = {
  operational: true,
  features: features(ALL_FEATURES.filter((key) => key !== 'BOOKING')),
};

// M25-S18a — the booking controllers behind the BFF's real guard chain (RolesGuard,
// ActiveStaffGuard, then TenantAccessGuard), with only the backend's answers faked. A request the
// guard refuses never reaches a controller, so the denial matrix needs no valid body.
describe('BFF booking routes — tenant access (component)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let httpService: MockHttpService;
  let backendHttpService: MockBackendHttpService;
  let restoreEnv: () => void;
  let counter = 0;

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

  // A fresh tenant and slug per call: the per-instance access and slug caches must never carry an
  // answer from one test into the next.
  function nextTenant(): { tenantId: string; slug: string } {
    counter += 1;
    return {
      tenantId: `60000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
      slug: `booking-access-${counter}`,
    };
  }

  interface TenantAnswer {
    tenantId: string;
    slug: string;
    access: object;
  }

  // The backend reads the guard chain makes, answered by URL so the order never matters and keyed
  // by tenant: a lookup for a tenant the test did not register fails loudly.
  function backendAnswers(...tenants: TenantAnswer[]): void {
    httpService.get.mockImplementation((url: string) => {
      if (url.includes('/staff/me/status')) return makeObservableResponse({ isActive: true });
      if (url.includes('/internal/tenants/by-slug/')) {
        const bySlug = tenants.find((entry) => url.endsWith(`/by-slug/${entry.slug}`));
        if (!bySlug) throw new Error(`Unexpected by-slug lookup: ${url}`);
        return makeObservableResponse({ id: bySlug.tenantId, slug: bySlug.slug, name: 'Tenant' });
      }
      const byId = tenants.find((entry) => url.includes(`/tenants/${entry.tenantId}/access`));
      if (!byId) throw new Error(`Unexpected access lookup: ${url}`);
      return makeObservableResponse(byId.access);
    });
  }

  const tokenFor = (role: Role, tenantId: string): string => {
    if (role === 'CUSTOMER') return makeCustomerJwt(jwtService, { tenantId });
    return makeManagerJwt(jwtService, { tenantId, role });
  };

  function call(route: BookingRoute, tenantId: string, slug: string, role = route.role) {
    const req = request(app.getHttpServer())[route.method](route.path);
    if (!role) return req.set('X-Tenant-Slug', slug);
    return req.set('Authorization', `Bearer ${tokenFor(role, tenantId)}`);
  }

  const controllerNeverRan = () => {
    expect(backendHttpService.get).not.toHaveBeenCalled();
    expect(backendHttpService.post).not.toHaveBeenCalled();
    expect(backendHttpService.patch).not.toHaveBeenCalled();
    expect(backendHttpService.getForPublic).not.toHaveBeenCalled();
    expect(backendHttpService.postForPublic).not.toHaveBeenCalled();
    expect(backendHttpService.patchForPublic).not.toHaveBeenCalled();
  };

  describe('a tenant without BOOKING', () => {
    it.each(ROUTES.map((route) => ({ route, label: routeKey(route) })))(
      'refuses $label with BILLING_FEATURE_NOT_ENTITLED',
      async ({ route }) => {
        const { tenantId, slug } = nextTenant();
        backendAnswers({ tenantId, slug, access: WITHOUT_BOOKING });

        const res = await call(route, tenantId, slug);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
        controllerNeverRan();
      },
    );
  });

  describe('a suspended tenant', () => {
    it.each(SUSPENDED_ROUTES.map((route) => ({ route, label: routeKey(route) })))(
      'refuses $label with BILLING_TENANT_SUSPENDED',
      async ({ route }) => {
        const { tenantId, slug } = nextTenant();
        backendAnswers({ tenantId, slug, access: SUSPENDED });

        const res = await call(route, tenantId, slug);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
        controllerNeverRan();
      },
    );

    it("lets the customer read their booking list (UC-121 'CUSTOMER_HISTORY')", async () => {
      const { tenantId, slug } = nextTenant();
      backendAnswers({ tenantId, slug, access: SUSPENDED });
      backendHttpService.get.mockResolvedValueOnce({
        items: [],
        pagination: { limit: 20, offset: 0, total: 0, hasMore: false },
      });

      const res = await call({ method: 'get', path: '/v1/bookings' }, tenantId, slug, 'CUSTOMER');

      expect(res.status).toBe(200);
      expect(backendHttpService.get).toHaveBeenCalledWith('/bookings', expect.anything());
    });

    it('lets the customer cancel a future booking', async () => {
      const { tenantId, slug } = nextTenant();
      backendAnswers({ tenantId, slug, access: SUSPENDED });
      backendHttpService.patch.mockResolvedValueOnce({ bookingId: SOME_ID, status: 'CANCELLED' });

      const res = await call(
        { method: 'patch', path: `/v1/bookings/${SOME_ID}/cancel` },
        tenantId,
        slug,
        'CUSTOMER',
      );

      expect(res.status).toBe(200);
      expect(backendHttpService.patch).toHaveBeenCalledWith(
        `/bookings/${SOME_ID}/cancel-customer`,
        {},
      );
    });

    it.each([
      { label: 'the booking list', method: 'get', path: '/v1/bookings' },
      { label: 'the cancel', method: 'patch', path: `/v1/bookings/${SOME_ID}/cancel` },
    ] as const)(
      'refuses a staff caller $label at the BFF (CUSTOMER_HISTORY is customer-only)',
      async ({ method, path }) => {
        const { tenantId, slug } = nextTenant();
        backendAnswers({ tenantId, slug, access: SUSPENDED });

        for (const role of ['STAFF', 'MANAGER'] as const) {
          const res = await call({ method, path }, tenantId, slug, role);

          expect(res.status).toBe(403);
          expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
        }
        controllerNeverRan();
      },
    );
  });

  // These three routes carry their tenant in a guest token or the request body, which the BFF guard
  // does not read: it resolves no tenant and lets them through, and the backend gate (every backend
  // call carries `X-Tenant-ID`) does the refusing. Each test makes the backend answer as that gate
  // does for a suspended tenant and checks the BFF hands the denial back unchanged.
  describe('the token-based public routes (the backend gate refuses them)', () => {
    const BOOKING_ID = '40000000-0000-4000-8000-000000000006';
    // `throwProblemDetail` throws, so each mock throws it from its implementation.
    const backendDenial = (): never =>
      throwProblemDetail(HttpStatus.FORBIDDEN, BillingErrorCode.TENANT_SUSPENDED, 'suspended');

    function guestToken(tenantId: string): string {
      const secret = app.get(ConfigService).getOrThrow<string>('JWT_SECRET');
      return jwt.sign(
        { bookingId: BOOKING_ID, tenantId, contactEmail: 'guest@example.com' },
        secret,
        {
          expiresIn: 604800,
        },
      );
    }

    it('GET :id/guest passes the BFF guard without an access lookup and returns the backend denial', async () => {
      const { tenantId } = nextTenant();
      backendHttpService.getForPublic.mockImplementationOnce(backendDenial);

      const res = await request(app.getHttpServer()).get(
        `/v1/bookings/${BOOKING_ID}/guest?token=${guestToken(tenantId)}`,
      );

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      expect(backendHttpService.getForPublic).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID}`,
        tenantId,
      );
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('PATCH :id/submit-info/guest passes the BFF guard without an access lookup and returns the backend denial', async () => {
      const { tenantId } = nextTenant();
      backendHttpService.patchForPublic.mockImplementationOnce(backendDenial);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID}/submit-info/guest?token=${guestToken(tenantId)}`)
        .send({ response: 'Fotos do veículo' });

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      expect(backendHttpService.patchForPublic).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID}/submit-info/guest`,
        expect.anything(),
        tenantId,
      );
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('POST attachments/signed-url passes the BFF guard without an access lookup and returns the backend denial', async () => {
      const { tenantId } = nextTenant();
      backendHttpService.postForPublic.mockImplementationOnce(backendDenial);

      const res = await request(app.getHttpServer())
        .post('/v1/bookings/attachments/signed-url')
        .send({ fileName: 'foto.png', contentType: 'image/png', guestToken: guestToken(tenantId) });

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      expect(backendHttpService.postForPublic).toHaveBeenCalledWith(
        '/bookings/attachments/signed-url',
        expect.anything(),
        tenantId,
      );
      expect(httpService.get).not.toHaveBeenCalled();
    });
  });

  // The negative guarantee: an `exempt` subscription answers operational with every feature, so the
  // real guard chain must change nothing for it on any route.
  describe('an exempt tenant behaves exactly as before', () => {
    it.each(ROUTES.map((route) => ({ route, label: routeKey(route) })))(
      'never refuses $label with a billing denial',
      async ({ route }) => {
        const { tenantId, slug } = nextTenant();
        backendAnswers({ tenantId, slug, access: ENTITLED });

        const res = await call(route, tenantId, slug);

        expect(res.body?.code).not.toBe(BillingErrorCode.FEATURE_NOT_ENTITLED);
        expect(res.body?.code).not.toBe(BillingErrorCode.TENANT_SUSPENDED);
      },
    );

    it('serves the customer list and cancel with their normal results', async () => {
      const { tenantId, slug } = nextTenant();
      backendAnswers({ tenantId, slug, access: ENTITLED });
      backendHttpService.get.mockResolvedValueOnce({
        items: [],
        pagination: { limit: 20, offset: 0, total: 0, hasMore: false },
      });
      backendHttpService.patch.mockResolvedValueOnce({ bookingId: SOME_ID, status: 'CANCELLED' });

      const list = await call({ method: 'get', path: '/v1/bookings' }, tenantId, slug, 'CUSTOMER');
      const cancel = await call(
        { method: 'patch', path: `/v1/bookings/${SOME_ID}/cancel` },
        tenantId,
        slug,
        'CUSTOMER',
      );

      expect(list.status).toBe(200);
      expect(cancel.status).toBe(200);
      expect(cancel.body.status).toBe('CANCELLED');
    });
  });

  describe('an entitled tenant', () => {
    it('reaches the controller of an authenticated route', async () => {
      const { tenantId, slug } = nextTenant();
      backendAnswers({ tenantId, slug, access: ENTITLED });
      backendHttpService.get.mockResolvedValueOnce({
        items: [],
        pagination: { limit: 20, offset: 0, total: 0, hasMore: false },
      });

      const res = await call({ method: 'get', path: '/v1/bookings' }, tenantId, slug, 'MANAGER');

      expect(res.status).toBe(200);
    });
  });

  describe('tenant isolation', () => {
    it("denies only the suspended caller's own tenant", async () => {
      const suspended = nextTenant();
      const operational = nextTenant();
      const route: BookingRoute = { method: 'post', path: '/v1/bookings/staff', role: 'MANAGER' };
      backendAnswers({ ...suspended, access: SUSPENDED }, { ...operational, access: ENTITLED });

      const own = await call(route, suspended.tenantId, suspended.slug);
      backendHttpService.post.mockResolvedValueOnce({ bookingId: SOME_ID });
      const other = await call(route, operational.tenantId, operational.slug);

      expect(own.status).toBe(403);
      expect(own.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      expect(other.status).not.toBe(403);
    });
  });
});
