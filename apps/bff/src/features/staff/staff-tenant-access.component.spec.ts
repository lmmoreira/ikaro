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
type Role = 'STAFF' | 'MANAGER';
/** What a suspended tenant gets: refused, or still served (sign-in and the session). */
type WhileSuspended = 'DENIED' | 'REACHABLE';

interface StaffRoute {
  method: Method;
  /** The path under `/v1`. */
  path: string;
  role: Role;
  whileSuspended: WhileSuspended;
  body?: Record<string, unknown>;
}

const SOME_ID = '40000000-0000-4000-8000-000000000053';

const route = (
  method: Method,
  path: string,
  role: Role,
  whileSuspended: WhileSuspended,
  body?: Record<string, unknown>,
): StaffRoute => ({ method, path, role, whileSuspended, body });

// Every BFF route of the Staff controller. A request the guard refuses never reaches a controller,
// so the denial matrices need no valid body.
const ROUTES: StaffRoute[] = [
  route('post', '/v1/staff/invite', 'MANAGER', 'DENIED', {
    email: 'new@staff-access.test',
    firstName: 'New',
    lastName: 'Staff',
    role: 'STAFF',
  }),
  route('get', '/v1/staff', 'MANAGER', 'DENIED'),
  route('get', '/v1/staff/me', 'STAFF', 'REACHABLE'),
  route('get', `/v1/staff/${SOME_ID}`, 'MANAGER', 'DENIED'),
  route('patch', `/v1/staff/${SOME_ID}`, 'MANAGER', 'DENIED', { name: 'Renamed', role: 'STAFF' }),
  route('patch', `/v1/staff/${SOME_ID}/deactivate`, 'MANAGER', 'DENIED'),
  route('patch', `/v1/staff/${SOME_ID}/activate`, 'MANAGER', 'DENIED'),
];

const routeKey = (entry: StaffRoute) => `${entry.method} ${entry.path}`;
const asCases = (entries: StaffRoute[]) =>
  entries.map((entry) => ({ entry, label: routeKey(entry) }));

const DENIED = ROUTES.filter((entry) => entry.whileSuspended === 'DENIED');
const REACHABLE = ROUTES.filter((entry) => entry.whileSuspended === 'REACHABLE');
// The reads: the normal result an entitled or exempt tenant must keep getting.
const READS = ROUTES.filter((entry) => entry.method === 'get');

const ALL_FEATURES = ['HOTSITE', 'BOOKING', 'HOTSITE', 'CHATBOT', 'LEAD_FORM'] as const;
const features = (keys: readonly string[]) => keys.map((key) => ({ key, tier: 'STANDARD' }));

const SUSPENDED = { operational: false, features: [] };
const ENTITLED = { operational: true, features: features(ALL_FEATURES) };
const WITHOUT_HOTSITE = {
  operational: true,
  features: features(ALL_FEATURES.filter((key) => key !== 'HOTSITE')),
};

// One backend answer wide enough for every staff read: the paged list (no items) and a member.
const BACKEND_READ = {
  items: [],
  pagination: { total: 0, limit: 50, offset: 0 },
  id: SOME_ID,
  name: 'Staff Member',
};

// M25-S19 — the Staff controller behind the BFF's real guard chain (RolesGuard, ActiveStaffGuard,
// then TenantAccessGuard), with only the backend's answers faked. A request the guard refuses never
// reaches a controller, so the denial matrices need no valid body.
describe('BFF staff routes — tenant access (component)', () => {
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

  // A fresh tenant per call: the per-instance access cache must never carry an answer from one
  // test into the next.
  function nextTenant(): { tenantId: string } {
    counter += 1;
    return { tenantId: `70000000-0000-4000-8000-${String(counter + 300).padStart(12, '0')}` };
  }

  interface TenantAnswer {
    tenantId: string;
    access: object;
  }

  // The backend reads the guard chain makes, answered by URL so the order never matters and keyed
  // by tenant: a lookup for a tenant the test did not register fails loudly.
  function backendAnswers(...tenants: TenantAnswer[]): void {
    httpService.get.mockImplementation((url: string) => {
      if (url.includes('/staff/me/status')) return makeObservableResponse({ isActive: true });
      const byId = tenants.find((entry) => url.includes(`/tenants/${entry.tenantId}/access`));
      if (!byId) throw new Error(`Unexpected access lookup: ${url}`);
      return makeObservableResponse(byId.access);
    });
  }

  const tokenFor = (role: Role, tenantId: string): string =>
    makeManagerJwt(jwtService, { tenantId, role });

  function call(entry: StaffRoute, tenantId: string) {
    const req = request(app.getHttpServer())
      [entry.method](entry.path)
      .set('Authorization', `Bearer ${tokenFor(entry.role, tenantId)}`);
    return entry.body ? req.send(entry.body) : req;
  }

  const controllerNeverRan = () => {
    expect(backendHttpService.get).not.toHaveBeenCalled();
    expect(backendHttpService.patch).not.toHaveBeenCalled();
  };

  describe('a tenant without HOTSITE', () => {
    it.each(asCases(ROUTES))(
      'refuses $label with BILLING_FEATURE_NOT_ENTITLED',
      async ({ entry }) => {
        const { tenantId } = nextTenant();
        backendAnswers({ tenantId, access: WITHOUT_HOTSITE });

        const res = await call(entry, tenantId);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
        controllerNeverRan();
      },
    );
  });

  describe('a suspended tenant', () => {
    it.each(asCases(DENIED))('refuses $label with BILLING_TENANT_SUSPENDED', async ({ entry }) => {
      const { tenantId } = nextTenant();
      backendAnswers({ tenantId, access: SUSPENDED });

      const res = await call(entry, tenantId);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      controllerNeverRan();
    });

    it.each(asCases(REACHABLE))('still serves $label', async ({ entry }) => {
      const { tenantId } = nextTenant();
      backendAnswers({ tenantId, access: SUSPENDED });
      backendHttpService.get.mockResolvedValue(BACKEND_READ);

      const res = await call(entry, tenantId);

      expect(res.status).toBe(200);
      expect(backendHttpService.get).toHaveBeenCalled();
    });
  });

  // The negative guarantee: an `exempt` subscription answers operational with every feature, so the
  // real guard chain must change nothing for it on any route.
  describe('an exempt tenant behaves exactly as before', () => {
    it.each(asCases(ROUTES))('never refuses $label with a billing denial', async ({ entry }) => {
      const { tenantId } = nextTenant();
      backendAnswers({ tenantId, access: ENTITLED });

      const res = await call(entry, tenantId);

      expect(res.body?.code).not.toBe(BillingErrorCode.FEATURE_NOT_ENTITLED);
      expect(res.body?.code).not.toBe(BillingErrorCode.TENANT_SUSPENDED);
    });

    it.each(asCases(READS))('serves $label with its normal result', async ({ entry }) => {
      const { tenantId } = nextTenant();
      backendAnswers({ tenantId, access: ENTITLED });
      backendHttpService.get.mockResolvedValue(BACKEND_READ);

      const res = await call(entry, tenantId);

      expect(res.status).toBe(200);
    });

    it('serves an update with its normal result', async () => {
      const { tenantId } = nextTenant();
      backendAnswers({ tenantId, access: ENTITLED });
      backendHttpService.patch.mockResolvedValue(BACKEND_READ);
      const update = ROUTES.find((entry) => entry.method === 'patch')!;

      const res = await call(update, tenantId);

      expect(res.status).toBe(200);
    });
  });

  describe('an entitled tenant', () => {
    it.each(asCases(READS))('reaches the controller of $label', async ({ entry }) => {
      const { tenantId } = nextTenant();
      backendAnswers({ tenantId, access: ENTITLED });
      backendHttpService.get.mockResolvedValue(BACKEND_READ);

      const res = await call(entry, tenantId);

      expect(res.status).toBe(200);
      expect(backendHttpService.get).toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it("denies only the suspended caller's own tenant", async () => {
      const suspended = nextTenant();
      const operational = nextTenant();
      const entry = route('get', '/v1/staff', 'MANAGER', 'DENIED');
      backendAnswers({ ...suspended, access: SUSPENDED }, { ...operational, access: ENTITLED });

      const own = await call(entry, suspended.tenantId);
      backendHttpService.get.mockResolvedValue(BACKEND_READ);
      const other = await call(entry, operational.tenantId);

      expect(own.status).toBe(403);
      expect(own.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      expect(other.status).toBe(200);
    });
  });
});
