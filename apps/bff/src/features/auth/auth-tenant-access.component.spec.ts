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

type Role = 'CUSTOMER' | 'STAFF' | 'MANAGER';

const ALL_FEATURES = ['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'].map((key) => ({
  key,
  tier: 'STANDARD',
}));
const SUSPENDED = { operational: false, features: [] };
const EXEMPT = { operational: true, features: ALL_FEATURES };

const STAFF_ID = '10000000-0000-4000-8000-0000000000a1';
const CUSTOMER_ID = '20000000-0000-4000-8000-0000000000a1';

// M25-S20 — the BFF's auth, health and billing access routes behind the real guard chain
// (RolesGuard, ActiveStaffGuard, then TenantAccessGuard), with only the backend's answers faked.
// A suspended tenant's users must still read their session, list and switch tenants, sign in and
// sign out.
describe('BFF auth routes — tenant access (component)', () => {
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

  // A fresh tenant per call: the per-instance access and by-slug caches must never carry an answer
  // from one test into the next.
  function nextTenant(): { tenantId: string; slug: string } {
    counter += 1;
    return {
      tenantId: `70000000-0000-4000-8000-${String(counter + 500).padStart(12, '0')}`,
      slug: `auth-tenant-${counter}`,
    };
  }

  interface TenantAnswer {
    tenantId: string;
    slug: string;
    access: object;
  }

  // The reads the guard chain makes, answered by URL and keyed by tenant: a lookup for a tenant the
  // test did not register fails loudly.
  function guardAnswers(...tenants: TenantAnswer[]): void {
    httpService.get.mockImplementation((url: string) => {
      if (url.includes('/staff/me/status')) return makeObservableResponse({ isActive: true });
      const bySlug = tenants.find((entry) => url.includes(`/by-slug/${entry.slug}`));
      if (bySlug) return makeObservableResponse({ id: bySlug.tenantId, slug: bySlug.slug });
      const byId = tenants.find((entry) => url.includes(`/tenants/${entry.tenantId}/access`));
      if (!byId) throw new Error(`Unexpected access lookup: ${url}`);
      return makeObservableResponse(byId.access);
    });
  }

  const tokenFor = (role: Role, tenantId: string): string => {
    if (role === 'CUSTOMER') return makeCustomerJwt(jwtService, { tenantId });
    return makeManagerJwt(jwtService, { tenantId, role });
  };

  describe('a suspended tenant', () => {
    it.each<Role>(['STAFF', 'MANAGER'])('still serves GET /auth/session for %s', async (role) => {
      const { tenantId, slug } = nextTenant();
      guardAnswers({ tenantId, slug, access: SUSPENDED });
      backendHttpService.get.mockResolvedValue({ id: STAFF_ID, name: 'Ana', role });

      const res = await request(app.getHttpServer())
        .get('/v1/auth/session')
        .set('Authorization', `Bearer ${tokenFor(role, tenantId)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ staff: { id: STAFF_ID, name: 'Ana' }, customer: null });
    });

    it('still serves GET /auth/session for a customer', async () => {
      const { tenantId, slug } = nextTenant();
      guardAnswers({ tenantId, slug, access: SUSPENDED });
      backendHttpService.get.mockResolvedValue({ customerId: CUSTOMER_ID, name: 'João' });

      const res = await request(app.getHttpServer())
        .get('/v1/auth/session')
        .set('Authorization', `Bearer ${tokenFor('CUSTOMER', tenantId)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        staff: null,
        customer: { customerId: CUSTOMER_ID, name: 'João' },
      });
    });

    it.each<Role>(['STAFF', 'MANAGER'])('still lists the staff tenants for %s', async (role) => {
      const { tenantId, slug } = nextTenant();
      guardAnswers({ tenantId, slug, access: SUSPENDED });
      backendHttpService.get.mockImplementation(async (url: string) =>
        url === '/staff/me/tenants'
          ? [{ staffId: STAFF_ID, tenantId, role, isActive: true }]
          : [{ id: tenantId, slug, name: 'Suspended Co' }],
      );

      const res = await request(app.getHttpServer())
        .get('/v1/auth/staff-tenants')
        .set('Authorization', `Bearer ${tokenFor(role, tenantId)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { staffId: STAFF_ID, tenantId, tenantSlug: slug, tenantName: 'Suspended Co', role },
      ]);
    });

    it.each<Role>(['STAFF', 'MANAGER'])('still switches staff tenant for %s', async (role) => {
      const { tenantId, slug } = nextTenant();
      guardAnswers({ tenantId, slug, access: SUSPENDED });
      backendHttpService.get.mockImplementation(async (url: string) =>
        url === '/staff/me/tenants'
          ? [{ staffId: STAFF_ID, tenantId, role, isActive: true }]
          : { id: tenantId, slug, name: 'Suspended Co' },
      );

      const res = await request(app.getHttpServer())
        .post('/v1/auth/switch-staff-tenant')
        .set('Authorization', `Bearer ${tokenFor(role, tenantId)}`)
        .send({ staffId: STAFF_ID });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ tenantSlug: slug });
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('still switches a customer to another tenant', async () => {
      const { tenantId, slug } = nextTenant();
      guardAnswers({ tenantId, slug, access: SUSPENDED });
      backendHttpService.get.mockImplementation(async (url: string) =>
        url === '/customers/me/tenants'
          ? [{ tenantId, customerId: CUSTOMER_ID }]
          : { id: tenantId, slug, name: 'Suspended Co' },
      );

      const res = await request(app.getHttpServer())
        .post('/v1/auth/switch-tenant')
        .set('Authorization', `Bearer ${tokenFor('CUSTOMER', tenantId)}`)
        .send({ targetTenantId: tenantId });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ tenantSlug: slug });
    });

    it('still signs out, even when the request names the suspended tenant by slug', async () => {
      const { tenantId, slug } = nextTenant();
      guardAnswers({ tenantId, slug, access: SUSPENDED });

      const res = await request(app.getHttpServer())
        .get(`/v1/auth/logout?tenantSlug=${slug}`)
        .set('X-Tenant-Slug', slug);

      expect(res.status).toBe(302);
      expect(res.body.code).not.toBe(BillingErrorCode.TENANT_SUSPENDED);
    });

    it('still starts the Google sign-in even when the request names the suspended tenant by slug', async () => {
      const { tenantId, slug } = nextTenant();
      guardAnswers({ tenantId, slug, access: SUSPENDED });

      const res = await request(app.getHttpServer())
        .get(`/v1/auth/google?tenantSlug=${slug}`)
        .set('X-Tenant-Slug', slug);

      expect(res.status).not.toBe(403);
      expect(res.body?.code).not.toBe(BillingErrorCode.TENANT_SUSPENDED);
    });

    it('still answers the health probe', async () => {
      const res = await request(app.getHttpServer()).get('/v1/health/live');

      expect(res.status).toBe(200);
    });
  });

  describe('an exempt tenant behaves exactly as before', () => {
    it('serves the session, the tenant list and sign-out with no billing denial', async () => {
      const { tenantId, slug } = nextTenant();
      guardAnswers({ tenantId, slug, access: EXEMPT });
      backendHttpService.get.mockImplementation(async (url: string) =>
        url === '/staff/me/tenants'
          ? [{ staffId: STAFF_ID, tenantId, role: 'MANAGER', isActive: true }]
          : url === '/staff/me'
            ? { id: STAFF_ID, name: 'Ana', role: 'MANAGER' }
            : [{ id: tenantId, slug, name: 'Exempt Co' }],
      );
      const auth = { Authorization: `Bearer ${tokenFor('MANAGER', tenantId)}` };

      const session = await request(app.getHttpServer()).get('/v1/auth/session').set(auth);
      const tenants = await request(app.getHttpServer()).get('/v1/auth/staff-tenants').set(auth);
      const logout = await request(app.getHttpServer()).get(`/v1/auth/logout?tenantSlug=${slug}`);

      expect([session.status, tenants.status, logout.status]).toEqual([200, 200, 302]);
    });
  });

  describe('tenant isolation', () => {
    it('serves the other tenant normally and keeps the suspended one bound to its own JWT tenant', async () => {
      const suspended = nextTenant();
      const operational = nextTenant();
      guardAnswers({ ...suspended, access: SUSPENDED }, { ...operational, access: EXEMPT });
      backendHttpService.get.mockResolvedValue({ id: STAFF_ID, name: 'Ana', role: 'MANAGER' });

      const ok = await request(app.getHttpServer())
        .get('/v1/auth/session')
        .set('Authorization', `Bearer ${tokenFor('MANAGER', operational.tenantId)}`);
      const stillReachable = await request(app.getHttpServer())
        .get('/v1/auth/session')
        .set('Authorization', `Bearer ${tokenFor('MANAGER', suspended.tenantId)}`);

      expect(ok.status).toBe(200);
      expect(stillReachable.status).toBe(200);
      // The gate looked up each JWT tenant's own access, never one tenant's answer for the other.
      const lookedUp = httpService.get.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.includes('/access'));
      expect(lookedUp.some((url) => url.includes(operational.tenantId))).toBe(true);
      expect(lookedUp.some((url) => url.includes(suspended.tenantId))).toBe(true);
    });
  });
});
