import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { BillingErrorCode } from '@ikaro/types';
import {
  MockBackendHttpService,
  MockHttpService,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeObservableResponse,
  request,
} from '../../test/component-test.helpers';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
type Role = 'CUSTOMER' | 'MANAGER';

interface OperationsRoute {
  method: Method;
  /** The path under `/v1`. */
  path: string;
  /** A JWT caller; omitted on the public routes, which name their tenant in `X-Tenant-Slug`. */
  role?: Role;
}

const SOME_ID = '40000000-0000-4000-8000-000000000043';

const route = (method: Method, path: string, role?: Role): OperationsRoute => ({
  method,
  path,
  role,
});

// Every BFF route of the Booking operations half: services, resources, the schedule, recurring
// schedules, availability alerts and the worklist. A request the guard refuses never reaches a
// controller, so the denial matrices need no valid body.
const ROUTES: OperationsRoute[] = [
  route('get', '/v1/services', 'MANAGER'),
  route('get', `/v1/services/${SOME_ID}`, 'MANAGER'),
  route('get', `/v1/services/${SOME_ID}/edit-view`, 'MANAGER'),
  route('post', '/v1/services', 'MANAGER'),
  route('patch', `/v1/services/${SOME_ID}`, 'MANAGER'),
  route('patch', `/v1/services/${SOME_ID}/resource-requirements`, 'MANAGER'),
  route('put', `/v1/services/${SOME_ID}/legs`, 'MANAGER'),
  route('patch', `/v1/services/${SOME_ID}/booking-policy`, 'MANAGER'),
  route('patch', `/v1/services/${SOME_ID}/public-page`, 'MANAGER'),
  route('post', `/v1/services/${SOME_ID}/intake-schema`, 'MANAGER'),
  route('get', `/v1/services/${SOME_ID}/intake-schema`, 'MANAGER'),
  route('patch', `/v1/services/${SOME_ID}/activate`, 'MANAGER'),
  route('delete', `/v1/services/${SOME_ID}`, 'MANAGER'),
  route('get', '/v1/resources', 'MANAGER'),
  route('get', '/v1/resources/staff-options', 'MANAGER'),
  route('get', `/v1/resources/${SOME_ID}`, 'MANAGER'),
  route('post', '/v1/resources', 'MANAGER'),
  route('patch', `/v1/resources/${SOME_ID}`, 'MANAGER'),
  route('delete', `/v1/resources/${SOME_ID}`, 'MANAGER'),
  route('post', `/v1/resources/${SOME_ID}/reactivate`, 'MANAGER'),
  route('get', '/v1/recurring-booking-schedules', 'CUSTOMER'),
  route('get', `/v1/recurring-booking-schedules/${SOME_ID}`, 'CUSTOMER'),
  route('post', '/v1/recurring-booking-schedules', 'CUSTOMER'),
  route('post', `/v1/recurring-booking-schedules/${SOME_ID}/end`, 'CUSTOMER'),
  route('post', `/v1/recurring-booking-schedules/${SOME_ID}/approve`, 'MANAGER'),
  route('post', `/v1/recurring-booking-schedules/${SOME_ID}/reject`, 'MANAGER'),
  route('post', '/v1/availability-alerts', 'CUSTOMER'),
  route('get', '/v1/availability-alerts', 'CUSTOMER'),
  route('get', `/v1/availability-alerts/${SOME_ID}`, 'CUSTOMER'),
  route('patch', `/v1/availability-alerts/${SOME_ID}`, 'CUSTOMER'),
  route('delete', `/v1/availability-alerts/${SOME_ID}`, 'CUSTOMER'),
  route('get', '/v1/scheduling-exceptions', 'MANAGER'),
  route('get', '/v1/scheduling-exceptions/count', 'MANAGER'),
  route('get', `/v1/scheduling-exceptions/by-booking/${SOME_ID}`, 'MANAGER'),
  route('post', '/v1/scheduling-exceptions/resolve', 'MANAGER'),
  route('post', '/v1/scheduling-exceptions/dismiss', 'MANAGER'),
  route('get', '/v1/schedule/closures', 'MANAGER'),
  route('post', '/v1/schedule/closures', 'MANAGER'),
  route('delete', `/v1/schedule/closures/${SOME_ID}`, 'MANAGER'),
  route('get', '/v1/schedule/openings', 'MANAGER'),
  route('post', '/v1/schedule/openings', 'MANAGER'),
  route('delete', `/v1/schedule/openings/${SOME_ID}`, 'MANAGER'),
  route('get', '/v1/schedule/day-grid', 'MANAGER'),
  route('get', '/v1/schedule/availability'),
  route('get', '/v1/schedule/availability/summary'),
  route('get', '/v1/public/services'),
  route('get', '/v1/public/services/by-slug/some-service'),
  route('get', `/v1/public/services/${SOME_ID}/resource-options`),
  route('get', `/v1/public/services/${SOME_ID}/quote`),
  route('get', `/v1/public/services/${SOME_ID}/intake-schema`),
];

// One passthrough read per authenticated family: the normal result an entitled or exempt tenant
// must keep getting.
const FAMILY_READS: OperationsRoute[] = [
  route('get', '/v1/resources', 'MANAGER'),
  route('get', '/v1/scheduling-exceptions/count', 'MANAGER'),
  route('get', '/v1/availability-alerts', 'CUSTOMER'),
  route('get', '/v1/recurring-booking-schedules', 'CUSTOMER'),
];

const routeKey = (entry: OperationsRoute) => `${entry.method} ${entry.path}`;

const ALL_FEATURES = ['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'] as const;
const features = (keys: readonly string[]) => keys.map((key) => ({ key, tier: 'STANDARD' }));

const SUSPENDED = { operational: false, features: [] };
const ENTITLED = { operational: true, features: features(ALL_FEATURES) };
const WITHOUT_BOOKING = {
  operational: true,
  features: features(ALL_FEATURES.filter((key) => key !== 'BOOKING')),
};

// M25-S18b — the operations controllers behind the BFF's real guard chain (RolesGuard,
// ActiveStaffGuard, then TenantAccessGuard), with only the backend's answers faked. A request the
// guard refuses never reaches a controller, so the denial matrices need no valid body.
describe('BFF booking operations routes — tenant access (component)', () => {
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
      tenantId: `70000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
      slug: `booking-ops-access-${counter}`,
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

  const tokenFor = (role: Role, tenantId: string): string =>
    role === 'CUSTOMER'
      ? makeCustomerJwt(jwtService, { tenantId })
      : makeManagerJwt(jwtService, { tenantId });

  function call(entry: OperationsRoute, tenantId: string, slug: string) {
    const req = request(app.getHttpServer())[entry.method](entry.path);
    if (!entry.role) return req.set('X-Tenant-Slug', slug);
    return req.set('Authorization', `Bearer ${tokenFor(entry.role, tenantId)}`);
  }

  const controllerNeverRan = () => {
    expect(backendHttpService.get).not.toHaveBeenCalled();
    expect(backendHttpService.post).not.toHaveBeenCalled();
    expect(backendHttpService.patch).not.toHaveBeenCalled();
    expect(backendHttpService.put).not.toHaveBeenCalled();
    expect(backendHttpService.delete).not.toHaveBeenCalled();
    expect(backendHttpService.getForPublic).not.toHaveBeenCalled();
    expect(backendHttpService.postForPublic).not.toHaveBeenCalled();
    expect(backendHttpService.patchForPublic).not.toHaveBeenCalled();
  };

  describe('a tenant without BOOKING', () => {
    it.each(ROUTES.map((entry) => ({ entry, label: routeKey(entry) })))(
      'refuses $label with BILLING_FEATURE_NOT_ENTITLED',
      async ({ entry }) => {
        const { tenantId, slug } = nextTenant();
        backendAnswers({ tenantId, slug, access: WITHOUT_BOOKING });

        const res = await call(entry, tenantId, slug);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
        controllerNeverRan();
      },
    );
  });

  describe('a suspended tenant', () => {
    it.each(ROUTES.map((entry) => ({ entry, label: routeKey(entry) })))(
      'refuses $label with BILLING_TENANT_SUSPENDED, the public routes included',
      async ({ entry }) => {
        const { tenantId, slug } = nextTenant();
        backendAnswers({ tenantId, slug, access: SUSPENDED });

        const res = await call(entry, tenantId, slug);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
        controllerNeverRan();
      },
    );
  });

  // The negative guarantee: an `exempt` subscription answers operational with every feature, so the
  // real guard chain must change nothing for it on any route.
  describe('an exempt tenant behaves exactly as before', () => {
    it.each(ROUTES.map((entry) => ({ entry, label: routeKey(entry) })))(
      'never refuses $label with a billing denial',
      async ({ entry }) => {
        const { tenantId, slug } = nextTenant();
        backendAnswers({ tenantId, slug, access: ENTITLED });

        const res = await call(entry, tenantId, slug);

        expect(res.body?.code).not.toBe(BillingErrorCode.FEATURE_NOT_ENTITLED);
        expect(res.body?.code).not.toBe(BillingErrorCode.TENANT_SUSPENDED);
      },
    );

    it.each(FAMILY_READS.map((entry) => ({ entry, label: routeKey(entry) })))(
      'serves $label with its normal result',
      async ({ entry }) => {
        const { tenantId, slug } = nextTenant();
        backendAnswers({ tenantId, slug, access: ENTITLED });
        backendHttpService.get.mockResolvedValueOnce({ items: [] });

        const res = await call(entry, tenantId, slug);

        expect(res.status).toBe(200);
      },
    );
  });

  describe('an entitled tenant', () => {
    it('reaches the controller of an authenticated route', async () => {
      const { tenantId, slug } = nextTenant();
      backendAnswers({ tenantId, slug, access: ENTITLED });
      backendHttpService.get.mockResolvedValueOnce({ items: [] });

      const res = await call(route('get', '/v1/resources', 'MANAGER'), tenantId, slug);

      expect(res.status).toBe(200);
      expect(backendHttpService.get).toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it("denies only the suspended caller's own tenant", async () => {
      const suspended = nextTenant();
      const operational = nextTenant();
      const entry = route('get', '/v1/resources', 'MANAGER');
      backendAnswers({ ...suspended, access: SUSPENDED }, { ...operational, access: ENTITLED });

      const own = await call(entry, suspended.tenantId, suspended.slug);
      backendHttpService.get.mockResolvedValueOnce({ items: [] });
      const other = await call(entry, operational.tenantId, operational.slug);

      expect(own.status).toBe(403);
      expect(own.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      expect(other.status).toBe(200);
    });
  });
});
