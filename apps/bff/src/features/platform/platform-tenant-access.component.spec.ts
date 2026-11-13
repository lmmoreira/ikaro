import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { BillingErrorCode } from '@ikaro/types';
import {
  MockBackendHttpService,
  MockHttpService,
  createTestApp,
  makeManagerJwt,
  makeObservableResponse,
  request,
} from '../../test/component-test.helpers';

type Method = 'get' | 'post' | 'patch';
type Feature = 'HOTSITE' | 'CHATBOT' | 'LEAD_FORM';

interface PlatformRoute {
  method: Method;
  /** The path under `/v1`; a public route that names its tenant takes the slug from here. */
  path: (slug: string) => string;
  /** `true` → a guest route: the tenant comes from the slug, never from a JWT. */
  isPublic: boolean;
  feature: Feature;
}

const authed = (method: Method, path: string, feature: Feature): PlatformRoute => ({
  method,
  path: () => path,
  isPublic: false,
  feature,
});
const publicRoute = (
  method: Method,
  path: (slug: string) => string,
  feature: Feature,
): PlatformRoute => ({ method, path, isPublic: true, feature });

// Every BFF Platform route the gate can decide for, except the published-hotsites list: it names no
// tenant (no slug, no JWT), so the guard has nothing to gate there and passes it through.
const ROUTES: PlatformRoute[] = [
  authed('get', '/v1/tenants/hotsite', 'HOTSITE'),
  authed('patch', '/v1/tenants/hotsite', 'HOTSITE'),
  authed('post', '/v1/tenants/hotsite/publish', 'HOTSITE'),
  authed('post', '/v1/tenants/hotsite/unpublish', 'HOTSITE'),
  authed('post', '/v1/tenants/hotsite/images/signed-url', 'HOTSITE'),
  authed('post', '/v1/tenants/hotsite/images/read-signed-url', 'HOTSITE'),
  authed('post', '/v1/tenants/hotsite/gallery/feature-booking-photo', 'HOTSITE'),
  authed('post', '/v1/tenants/hotsite/images/delete', 'HOTSITE'),
  authed('get', '/v1/tenants/hotsite/templates', 'HOTSITE'),
  authed('post', '/v1/tenants/hotsite/templates/classic/apply', 'HOTSITE'),
  authed('patch', '/v1/tenants', 'HOTSITE'),
  authed('get', '/v1/tenants/settings', 'HOTSITE'),
  authed('patch', '/v1/tenants/settings', 'HOTSITE'),
  authed('get', '/v1/tenants/chatbot/cap-status', 'CHATBOT'),
  authed('get', '/v1/tenants/lead-form/config', 'LEAD_FORM'),
  authed('get', '/v1/tenants/lead-form/status', 'LEAD_FORM'),
  authed('get', '/v1/tenants/lead-form/submissions', 'LEAD_FORM'),
  authed('get', '/v1/tenants/lead-form/submissions/filter-options', 'LEAD_FORM'),
  authed(
    'get',
    '/v1/tenants/lead-form/submissions/30000000-0000-4000-8000-000000000009',
    'LEAD_FORM',
  ),
  publicRoute('get', (slug) => `/v1/public/platform/manifest/${slug}`, 'HOTSITE'),
  publicRoute('get', () => '/v1/public/platform/chatbot/status', 'CHATBOT'),
  publicRoute('post', () => '/v1/public/platform/chatbot/messages', 'CHATBOT'),
  publicRoute('get', (slug) => `/v1/public/platform/lead-form/${slug}`, 'LEAD_FORM'),
  publicRoute('post', (slug) => `/v1/public/platform/lead-form/${slug}/submissions`, 'LEAD_FORM'),
];

const ALL_FEATURES = ['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'] as const;
const features = (keys: readonly string[]) => keys.map((key) => ({ key, tier: 'STANDARD' }));

const SUSPENDED = { operational: false, features: [] };
const ENTITLED = { operational: true, features: features(ALL_FEATURES) };
const operationalWithout = (feature: Feature) => ({
  operational: true,
  features: features(ALL_FEATURES.filter((key) => key !== feature)),
});

const manifestRoute = ROUTES.find((route) => route.path('s').includes('/manifest/'))!;

// M25-S17 — the Platform controllers behind the BFF's real guard chain (RolesGuard, ActiveStaffGuard,
// then TenantAccessGuard), with only the backend's answers faked. A request the guard refuses never
// reaches a controller, so the denial matrix needs no valid body.
describe('BFF Platform routes — tenant access (component)', () => {
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
      tenantId: `50000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
      slug: `platform-access-${counter}`,
    };
  }

  // The three backend reads the guard chain makes, answered by URL so the order never matters.
  function backendAnswers(tenantId: string, slug: string, access: object): void {
    httpService.get.mockImplementation((url: string) => {
      if (url.includes('/staff/me/status')) return makeObservableResponse({ isActive: true });
      if (url.includes('/internal/tenants/by-slug/')) {
        return makeObservableResponse({ id: tenantId, slug, name: 'Tenant' });
      }
      return makeObservableResponse(access);
    });
  }

  function call(route: PlatformRoute, tenantId: string, slug: string) {
    const req = request(app.getHttpServer())[route.method](route.path(slug));
    if (route.isPublic) return req.set('X-Tenant-Slug', slug);
    return req.set('Authorization', `Bearer ${makeManagerJwt(jwtService, { tenantId })}`);
  }

  const controllerNeverRan = () => {
    expect(backendHttpService.get).not.toHaveBeenCalled();
    expect(backendHttpService.post).not.toHaveBeenCalled();
    expect(backendHttpService.patch).not.toHaveBeenCalled();
    expect(backendHttpService.getForPublic).not.toHaveBeenCalled();
    expect(backendHttpService.postForPublic).not.toHaveBeenCalled();
  };

  describe('a tenant without the feature', () => {
    it.each(ROUTES.map((route) => ({ route, label: `${route.method} ${route.path(':slug')}` })))(
      'refuses $label with BILLING_FEATURE_NOT_ENTITLED',
      async ({ route }) => {
        const { tenantId, slug } = nextTenant();
        backendAnswers(tenantId, slug, operationalWithout(route.feature));

        const res = await call(route, tenantId, slug);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
        controllerNeverRan();
      },
    );
  });

  describe('a suspended tenant', () => {
    it.each(
      ROUTES.filter((route) => route !== manifestRoute).map((route) => ({
        route,
        label: `${route.method} ${route.path(':slug')}`,
      })),
    )('refuses $label with BILLING_TENANT_SUSPENDED', async ({ route }) => {
      const { tenantId, slug } = nextTenant();
      backendAnswers(tenantId, slug, SUSPENDED);

      const res = await call(route, tenantId, slug);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      controllerNeverRan();
    });

    it('still serves the manifest with 200 and its branding (never a typed denial)', async () => {
      const { tenantId, slug } = nextTenant();
      backendAnswers(tenantId, slug, SUSPENDED);
      const tenant = { id: tenantId, slug, name: 'Tenant' };
      backendHttpService.get.mockResolvedValueOnce(tenant);
      backendHttpService.getForPublic.mockResolvedValueOnce({
        isPublished: false,
        branding: { primaryColor: '#2563EB' },
        layout: [],
      });

      const res = await call(manifestRoute, tenantId, slug);

      expect(res.status).toBe(200);
      expect(res.body.branding).toEqual({ primaryColor: '#2563EB' });
    });
  });

  describe('an entitled tenant', () => {
    it('reaches the controller of an authenticated route', async () => {
      const { tenantId, slug } = nextTenant();
      backendAnswers(tenantId, slug, ENTITLED);
      backendHttpService.get.mockResolvedValueOnce({
        tenantId,
        name: 'Tenant',
        slug,
        settings: {},
      });

      const res = await call(authed('get', '/v1/tenants/settings', 'HOTSITE'), tenantId, slug);

      expect(res.status).toBe(200);
    });

    it('reaches the controller of a public route', async () => {
      const { tenantId, slug } = nextTenant();
      backendAnswers(tenantId, slug, ENTITLED);
      backendHttpService.get.mockResolvedValueOnce({ id: tenantId, slug, name: 'Tenant' });
      backendHttpService.getForPublic.mockResolvedValueOnce({ available: true });

      const res = await call(
        publicRoute('get', () => '/v1/public/platform/chatbot/status', 'CHATBOT'),
        tenantId,
        slug,
      );

      expect(res.status).toBe(200);
    });
  });

  describe('the settings route stays HOTSITE (a tenant without CHATBOT keeps its chatbot settings)', () => {
    it('saves chatbot settings but is refused the chatbot-owned cap-status', async () => {
      const { tenantId, slug } = nextTenant();
      backendAnswers(tenantId, slug, operationalWithout('CHATBOT'));
      backendHttpService.patch.mockResolvedValueOnce({
        tenantId,
        name: 'Tenant',
        slug,
        settings: {},
      });

      const saved = await request(app.getHttpServer())
        .patch('/v1/tenants/settings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService, { tenantId })}`)
        .send({ settings: { chatbot: { knowledgeText: 'Abrimos aos sábados.' } } });
      const capStatus = await call(
        authed('get', '/v1/tenants/chatbot/cap-status', 'CHATBOT'),
        tenantId,
        slug,
      );

      expect(saved.status).toBe(200);
      expect(capStatus.status).toBe(403);
      expect(capStatus.body).toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
    });
  });

  describe('tenant isolation', () => {
    it("denies only the suspended caller's own tenant", async () => {
      const suspended = nextTenant();
      const operational = nextTenant();
      const route = authed('get', '/v1/tenants/settings', 'HOTSITE');

      backendAnswers(suspended.tenantId, suspended.slug, SUSPENDED);
      const own = await call(route, suspended.tenantId, suspended.slug);

      backendAnswers(operational.tenantId, operational.slug, ENTITLED);
      backendHttpService.get.mockResolvedValueOnce({
        tenantId: operational.tenantId,
        name: 'Tenant',
        slug: operational.slug,
        settings: {},
      });
      const other = await call(route, operational.tenantId, operational.slug);

      expect(own.status).toBe(403);
      expect(other.status).toBe(200);
    });
  });
});
