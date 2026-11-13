import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { BillingErrorCode } from '@ikaro/types';
import type { FeatureKey } from '@ikaro/validation';
import { ErrorFilter } from '../../../../shared/filters/error.filter';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { TenantAccessGuard } from '../../../../shared/guards/tenant-access.guard';
import { TENANT_ACCESS_PORT } from '../../../../shared/ports/tenant-access.port';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import {
  HotsiteConfigEntityBuilder,
  TenantEntityBuilder,
} from '../../../../test/builders/platform';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { TenantEntity } from '../entities/tenant.entity';

const INTERNAL_KEY = 'integ-platform-access-key-xxxxxxx'; // 32+ chars
const TENANT_A = 'a5f0c1d2-0000-4000-8000-0000000000a1';
const TENANT_B = 'a5f0c1d2-0000-4000-8000-0000000000b2';
const SOME_ID = 'a5f0c1d2-0000-4000-8000-0000000000c3';

type Method = 'get' | 'post' | 'patch';
type Role = 'MANAGER' | 'STAFF';

interface PlatformRoute {
  method: Method;
  path: string;
  /** The caller's role; omitted on the public (guest) routes. */
  role?: Role;
  feature: FeatureKey;
}

// Every in-scope backend Platform route. A request the guard refuses never reaches a pipe or a use
// case, so the denial matrix needs no valid body.
const ROUTES: PlatformRoute[] = [
  { method: 'get', path: '/tenants/hotsite', role: 'MANAGER', feature: 'HOTSITE' },
  { method: 'get', path: '/tenants/hotsite/templates', role: 'MANAGER', feature: 'HOTSITE' },
  {
    method: 'post',
    path: '/tenants/hotsite/templates/t/apply',
    role: 'MANAGER',
    feature: 'HOTSITE',
  },
  { method: 'patch', path: '/tenants/hotsite', role: 'MANAGER', feature: 'HOTSITE' },
  { method: 'post', path: '/tenants/hotsite/publish', role: 'MANAGER', feature: 'HOTSITE' },
  { method: 'post', path: '/tenants/hotsite/unpublish', role: 'MANAGER', feature: 'HOTSITE' },
  {
    method: 'post',
    path: '/tenants/hotsite/images/signed-url',
    role: 'MANAGER',
    feature: 'HOTSITE',
  },
  {
    method: 'post',
    path: '/tenants/hotsite/images/read-signed-url',
    role: 'MANAGER',
    feature: 'HOTSITE',
  },
  {
    method: 'post',
    path: '/tenants/hotsite/gallery/feature-booking-photo',
    role: 'MANAGER',
    feature: 'HOTSITE',
  },
  { method: 'post', path: '/tenants/hotsite/images/delete', role: 'MANAGER', feature: 'HOTSITE' },
  { method: 'patch', path: '/tenants', role: 'MANAGER', feature: 'HOTSITE' },
  { method: 'get', path: '/tenants/settings', role: 'MANAGER', feature: 'HOTSITE' },
  { method: 'patch', path: '/tenants/settings', role: 'MANAGER', feature: 'HOTSITE' },
  { method: 'get', path: '/tenants/chatbot/cap-status', role: 'MANAGER', feature: 'CHATBOT' },
  { method: 'post', path: '/platform/chatbot/messages', feature: 'CHATBOT' },
  { method: 'get', path: '/platform/chatbot/status', feature: 'CHATBOT' },
  { method: 'get', path: '/platform/lead-form/config', feature: 'LEAD_FORM' },
  { method: 'post', path: '/platform/lead-form/submissions', feature: 'LEAD_FORM' },
  { method: 'get', path: '/tenants/lead-form/config', role: 'MANAGER', feature: 'LEAD_FORM' },
  { method: 'get', path: '/tenants/lead-form/status', role: 'STAFF', feature: 'LEAD_FORM' },
  { method: 'get', path: '/tenants/lead-form/submissions', role: 'STAFF', feature: 'LEAD_FORM' },
  {
    method: 'get',
    path: '/tenants/lead-form/submissions/filter-options',
    role: 'STAFF',
    feature: 'LEAD_FORM',
  },
  {
    method: 'get',
    path: `/tenants/lead-form/submissions/${SOME_ID}`,
    role: 'STAFF',
    feature: 'LEAD_FORM',
  },
];

const withoutFeature = (feature: FeatureKey) =>
  (['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'] as const)
    .filter((key) => key !== feature)
    .map((key) => ({ key, tier: 'STANDARD' as const }));

// M25-S17 — the real Platform controllers behind the real `TenantAccessGuard`, with only the access
// answer faked. Existing per-controller specs stay unchanged (they run without the guard, which is
// the non-regression proof for an entitled or exempt tenant).
const FIXTURE_TENANT_IDS = [TENANT_A, TENANT_B];

// FK-safe order: the hotsite config row references the tenant. Called defensively before seeding and
// as the whole teardown, so a reused Testcontainers database never carries these fixed-UUID rows over.
async function cleanupFixtures(ds: DataSource): Promise<void> {
  await ds.getRepository(HotsiteConfigEntity).delete({ tenantId: In(FIXTURE_TENANT_IDS) });
  await ds.getRepository(TenantEntity).delete({ id: In(FIXTURE_TENANT_IDS) });
}

describe('Platform routes — tenant access (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let access: InMemoryTenantAccessPort;

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
    access = new InMemoryTenantAccessPort();
    ({ app, ds } = await createPlatformIntegrationApp({
      extraProviders: [
        { provide: TENANT_ACCESS_PORT, useValue: access },
        { provide: APP_FILTER, useClass: ErrorFilter },
        { provide: APP_GUARD, useClass: InternalApiGuard },
        { provide: APP_GUARD, useClass: TenantAccessGuard },
      ],
    }));

    await cleanupFixtures(ds);

    for (const [id, slug] of [
      [TENANT_A, 'platform-access-integ-a'],
      [TENANT_B, 'platform-access-integ-b'],
    ]) {
      await ds
        .getRepository(TenantEntity)
        .save(new TenantEntityBuilder().withId(id!).withSlug(slug!).build());
      await ds
        .getRepository(HotsiteConfigEntity)
        .save(new HotsiteConfigEntityBuilder().withTenantId(id!).withIsPublished(true).build());
    }
  });

  afterEach(() => {
    access.reactivate(TENANT_A);
    access.reactivate(TENANT_B);
  });

  afterAll(async () => {
    try {
      await cleanupFixtures(ds);
    } finally {
      await app.close();
      delete process.env['INTERNAL_API_KEY'];
    }
  });

  function call(route: Pick<PlatformRoute, 'method' | 'path' | 'role'>, tenantId: string) {
    const req = request(app.getHttpServer())[route.method](route.path);
    req.set('X-Internal-Key', INTERNAL_KEY).set('X-Tenant-ID', tenantId);
    if (route.role) req.set('X-Actor-Role', route.role);
    return req;
  }

  describe('a tenant without the feature', () => {
    it.each(ROUTES)('refuses $method $path with BILLING_FEATURE_NOT_ENTITLED', async (route) => {
      access.seed(TENANT_A, {
        status: 'ACTIVE',
        suspensionReason: null,
        operational: true,
        features: withoutFeature(route.feature),
      });

      const res = await call(route, TENANT_A);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
    });
  });

  describe('a suspended tenant', () => {
    it.each(ROUTES)('refuses $method $path with BILLING_TENANT_SUSPENDED', async (route) => {
      access.seedSuspended(TENANT_A);

      const res = await call(route, TENANT_A);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: BillingErrorCode.TENANT_SUSPENDED });
    });

    it('still answers the manifest with 200 and its branding (never a typed denial)', async () => {
      access.seedSuspended(TENANT_A);

      const res = await call({ method: 'get', path: '/hotsite' }, TENANT_A);

      expect(res.status).toBe(200);
      expect(res.body.branding).toBeDefined();
    });
  });

  describe('an entitled tenant', () => {
    it.each([
      { method: 'get', path: '/hotsite' },
      { method: 'get', path: '/tenants/settings', role: 'MANAGER' },
      { method: 'get', path: '/tenants/lead-form/config', role: 'MANAGER' },
      { method: 'get', path: '/tenants/lead-form/status', role: 'STAFF' },
    ] as const)('reaches $method $path', async (route) => {
      const res = await call(route, TENANT_A);

      expect(res.status).toBe(200);
    });
  });

  describe('the settings route stays HOTSITE (a tenant without CHATBOT keeps its chatbot settings)', () => {
    it('saves chatbot settings but is refused the chatbot-owned cap-status', async () => {
      access.seed(TENANT_A, {
        status: 'ACTIVE',
        suspensionReason: null,
        operational: true,
        features: withoutFeature('CHATBOT'),
      });

      const saved = await request(app.getHttpServer())
        .patch('/tenants/settings')
        .set('X-Internal-Key', INTERNAL_KEY)
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ settings: { chatbot: { knowledgeText: 'Abrimos aos sábados.' } } });
      const capStatus = await call(
        { method: 'get', path: '/tenants/chatbot/cap-status', role: 'MANAGER' },
        TENANT_A,
      );

      expect(saved.status).toBe(200);
      expect(capStatus.status).toBe(403);
      expect(capStatus.body).toMatchObject({ code: BillingErrorCode.FEATURE_NOT_ENTITLED });
    });

    it('resumes exactly as left once the entitlement returns', async () => {
      access.seed(TENANT_A, {
        status: 'ACTIVE',
        suspensionReason: null,
        operational: true,
        features: withoutFeature('CHATBOT'),
      });
      await request(app.getHttpServer())
        .patch('/tenants/settings')
        .set('X-Internal-Key', INTERNAL_KEY)
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ settings: { chatbot: { knowledgeText: 'Texto preservado.' } } })
        .expect(200);
      access.reactivate(TENANT_A);

      const res = await call(
        { method: 'get', path: '/tenants/settings', role: 'MANAGER' },
        TENANT_A,
      );

      expect(res.status).toBe(200);
      expect(res.body.settings.chatbot.knowledgeText).toBe('Texto preservado.');
    });
  });

  describe('tenant isolation', () => {
    it("denies only the suspended caller's own tenant", async () => {
      access.seedSuspended(TENANT_A);

      const own = await call(
        { method: 'get', path: '/tenants/settings', role: 'MANAGER' },
        TENANT_A,
      );
      const other = await call(
        { method: 'get', path: '/tenants/settings', role: 'MANAGER' },
        TENANT_B,
      );

      expect(own.status).toBe(403);
      expect(other.status).toBe(200);
      expect(other.body.tenantId).toBe(TENANT_B);
    });
  });
});
