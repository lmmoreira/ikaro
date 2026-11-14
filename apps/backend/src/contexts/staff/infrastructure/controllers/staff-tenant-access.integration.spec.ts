import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { BillingErrorCode } from '@ikaro/types';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ErrorFilter } from '../../../../shared/filters/error.filter';
import { TenantAccessGuard } from '../../../../shared/guards/tenant-access.guard';
import { EventBusModule } from '../../../../shared/infrastructure/event-bus/event-bus.module';
import { InboxModule } from '../../../../shared/infrastructure/inbox/inbox.module';
import { InboxRecordEntity } from '../../../../shared/infrastructure/inbox/inbox-record.entity';
import { OutboxModule } from '../../../../shared/infrastructure/outbox/outbox.module';
import { TransactionManagerModule } from '../../../../shared/infrastructure/transaction-manager.module';
import { EVENT_BUS, EVENT_BUS_TRANSPORT } from '../../../../shared/ports/event-bus.port';
import { OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import { TENANT_ACCESS_PORT } from '../../../../shared/ports/tenant-access.port';
import { TENANT_SETTINGS_PORT } from '../../../../shared/ports/tenant-settings.port';
import { RequestInterceptor } from '../../../../shared/request/request.interceptor';
import { RequestModule } from '../../../../shared/request/request.module';
import { StaffEntityBuilder } from '../../../../test/builders/staff';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { testConfigModule } from '../../../../test/utils/test-config-module';
import { testTenantAccessModule } from '../../../../test/utils/test-tenant-access-module';
import { StaffModule } from '../../staff.module';
import { StaffEntity } from '../entities/staff.entity';

const MANAGER_ID = '20000000-0000-4000-8000-0000000000a5';
const STAFF_ID = '20000000-0000-4000-8000-0000000000a6';
const OTHER_ID = '20000000-0000-4000-8000-0000000000a7';
const ALL_FEATURES = ['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'] as const;

type Method = 'get' | 'post' | 'patch';
type Role = 'MANAGER' | 'STAFF';
/** What a suspended tenant gets: refused, or still served (sign-in, the notice, the picker). */
type WhileSuspended = 'DENIED' | 'REACHABLE';

interface StaffRoute {
  method: Method;
  path: string;
  role: Role;
  whileSuspended: WhileSuspended;
}

const route = (
  method: Method,
  path: string,
  role: Role,
  whileSuspended: WhileSuspended,
): StaffRoute => ({ method, path, role, whileSuspended });

// Every backend route of the Staff controller. A request the guard refuses never reaches a pipe or
// a use case, so the denial matrices need no valid body.
const ROUTES: StaffRoute[] = [
  route('get', '/staff', 'MANAGER', 'DENIED'),
  route('get', '/staff/me', 'STAFF', 'REACHABLE'),
  route('get', '/staff/me/status', 'STAFF', 'REACHABLE'),
  route('get', '/staff/me/tenants', 'STAFF', 'REACHABLE'),
  route('get', `/staff/${OTHER_ID}`, 'MANAGER', 'DENIED'),
  route('post', '/staff/invite', 'MANAGER', 'DENIED'),
  route('patch', `/staff/${OTHER_ID}`, 'MANAGER', 'DENIED'),
  route('patch', `/staff/${OTHER_ID}/deactivate`, 'MANAGER', 'DENIED'),
  route('patch', `/staff/${OTHER_ID}/activate`, 'MANAGER', 'DENIED'),
];

const routeKey = (entry: StaffRoute) => `${entry.method} ${entry.path}`;
const asCases = (entries: StaffRoute[]) =>
  entries.map((entry) => ({ entry, label: routeKey(entry) }));

const DENIED = ROUTES.filter((entry) => entry.whileSuspended === 'DENIED');
const REACHABLE = ROUTES.filter((entry) => entry.whileSuspended === 'REACHABLE');
// The reads that work for the seeded staff: the normal result an entitled or exempt tenant must
// keep getting.
const READS = ROUTES.filter((entry) => entry.method === 'get');

const withoutHotsite = () =>
  ALL_FEATURES.filter((key) => key !== 'HOTSITE').map((key) => ({
    key,
    tier: 'STANDARD' as const,
  }));

const allFeatures = () => ALL_FEATURES.map((key) => ({ key, tier: 'STANDARD' as const }));

// M25-S19 — the real Staff controller behind the real `TenantAccessGuard`, with only the access
// answer faked. The existing staff specs stay unchanged (they run without the guard, which is the
// non-regression proof for "no behaviour change").
describe('Staff routes — tenant access (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let access: InMemoryTenantAccessPort;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    const routingBus = new RoutingInMemoryEventBus();
    const moduleRef = await Test.createTestingModule({
      imports: [
        testConfigModule(),
        testTenantAccessModule(),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env['TEST_DATABASE_URL'],
          entities: [StaffEntity, InboxRecordEntity],
          synchronize: false,
        }),
        EventBusModule,
        OutboxModule,
        InboxModule,
        TransactionManagerModule,
        RequestModule,
        StaffModule,
      ],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: RequestInterceptor },
        { provide: APP_FILTER, useClass: ErrorFilter },
        { provide: APP_GUARD, useClass: TenantAccessGuard },
        { provide: TENANT_SETTINGS_PORT, useClass: InMemoryTenantSettingsPort },
      ],
    })
      .overrideProvider(EVENT_BUS)
      .useValue(routingBus)
      .overrideProvider(EVENT_BUS_TRANSPORT)
      .useValue(routingBus)
      .overrideProvider(OUTBOX_PUBLISHER)
      .useValue(routingBus)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    ds = moduleRef.get(DataSource);
    access = app.get<InMemoryTenantAccessPort>(TENANT_ACCESS_PORT);

    tenantA = uuidv7();
    tenantB = uuidv7();
    await ds.getRepository(StaffEntity).save([
      new StaffEntityBuilder()
        .withId(MANAGER_ID)
        .withTenantId(tenantA)
        .withEmail(`manager-${tenantA.slice(-8)}@staff-access.test`)
        .withGoogleOAuthId(`google-sub-staff-access-manager-${tenantA.slice(-8)}`)
        .withRole('MANAGER')
        .build(),
      new StaffEntityBuilder()
        .withTenantId(tenantB)
        .withEmail(`manager-${tenantB.slice(-8)}@staff-access.test`)
        .withGoogleOAuthId(`google-sub-staff-access-manager-${tenantB.slice(-8)}`)
        .withRole('MANAGER')
        .build(),
      new StaffEntityBuilder()
        .withId(STAFF_ID)
        .withTenantId(tenantA)
        .withEmail(`staff-${tenantA.slice(-8)}@staff-access.test`)
        .withGoogleOAuthId(`google-sub-staff-access-staff-${tenantA.slice(-8)}`)
        .withRole('STAFF')
        .build(),
      new StaffEntityBuilder()
        .withId(OTHER_ID)
        .withTenantId(tenantA)
        .withEmail(`other-${tenantA.slice(-8)}@staff-access.test`)
        .withGoogleOAuthId(`google-sub-staff-access-other-${tenantA.slice(-8)}`)
        .withRole('STAFF')
        .build(),
    ]);
  });

  afterEach(() => {
    access.reactivate(tenantA);
    access.reactivate(tenantB);
  });

  afterAll(async () => {
    await ds.getRepository(StaffEntity).delete({ tenantId: tenantA });
    await ds.getRepository(StaffEntity).delete({ tenantId: tenantB });
    await app.close();
  });

  function call(entry: StaffRoute, tenantId: string) {
    const actorId = entry.role === 'MANAGER' ? MANAGER_ID : STAFF_ID;
    const req = request(app.getHttpServer())[entry.method](entry.path);
    return req.set(actorHeaders(tenantId, actorId, entry.role));
  }

  describe('a tenant without HOTSITE', () => {
    it.each(asCases(ROUTES))(
      'refuses $label with BILLING_FEATURE_NOT_ENTITLED',
      async ({ entry }) => {
        access.seed(tenantA, {
          status: 'ACTIVE',
          suspensionReason: null,
          operational: true,
          features: withoutHotsite(),
        });

        const res = await call(entry, tenantA);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
      },
    );
  });

  describe('a suspended tenant', () => {
    it.each(asCases(DENIED))('refuses $label with BILLING_TENANT_SUSPENDED', async ({ entry }) => {
      access.seedSuspended(tenantA);

      const res = await call(entry, tenantA);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
    });

    // `/auth/session` calls `GET /staff/me`, the BFF `ActiveStaffGuard` calls
    // `GET /staff/me/status` on every staff request and the picker reads `GET /staff/me/tenants`:
    // a suspended tenant's staff must still get through all three.
    it.each(asCases(REACHABLE))('still serves $label', async ({ entry }) => {
      access.seedSuspended(tenantA);

      const res = await call(entry, tenantA);

      expect(res.status).toBe(200);
    });

    // The suspension reason reaches the staff from `GET /v1/billing/access`, never from a staff
    // route: the status answer keeps its normal shape and carries nothing about billing.
    it('GET /staff/me/status keeps its normal body and carries no suspension field', async () => {
      const status = route('get', '/staff/me/status', 'STAFF', 'REACHABLE');
      const active = await call(status, tenantA);
      access.seedSuspended(tenantA);

      const suspended = await call(status, tenantA);

      expect(suspended.status).toBe(200);
      expect(suspended.body).toEqual(active.body);
      expect(Object.keys(suspended.body)).toEqual(['isActive']);
    });
  });

  // The negative guarantee: an `exempt` subscription answers ACTIVE, operational, with every
  // feature, so the real guard must change nothing for it on any route.
  describe('an exempt tenant behaves exactly as before', () => {
    const seedExempt = (tenantId: string) =>
      access.seed(tenantId, {
        status: 'ACTIVE',
        suspensionReason: null,
        operational: true,
        features: allFeatures(),
      });

    it.each(asCases(ROUTES))('never refuses $label with a billing denial', async ({ entry }) => {
      seedExempt(tenantA);

      const res = await call(entry, tenantA);

      expect(res.body?.code).not.toBe(BillingErrorCode.FEATURE_NOT_ENTITLED);
      expect(res.body?.code).not.toBe(BillingErrorCode.TENANT_SUSPENDED);
    });

    it.each(asCases(READS))('serves $label with its normal result', async ({ entry }) => {
      seedExempt(tenantA);

      const res = await call(entry, tenantA);

      expect(res.status).toBe(200);
    });
  });

  describe('an entitled tenant', () => {
    it.each(asCases(READS))('reaches $label', async ({ entry }) => {
      const res = await call(entry, tenantA);

      expect(res.status).toBe(200);
    });
  });

  describe('tenant isolation', () => {
    it("denies only the suspended caller's own tenant", async () => {
      access.seedSuspended(tenantA);
      const list = route('get', '/staff', 'MANAGER', 'DENIED');

      const own = await call(list, tenantA);
      const other = await call(list, tenantB);

      expect(own.status).toBe(403);
      expect(own.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
      expect(other.status).toBe(200);
    });
  });
});
