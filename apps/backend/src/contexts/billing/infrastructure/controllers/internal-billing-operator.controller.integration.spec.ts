import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { BillingErrorCode } from '@ikaro/types';
import { FEATURE_KEYS } from '@ikaro/validation';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { TENANT_ACCESS_PORT, TenantAccessPort } from '../../../../shared/ports/tenant-access.port';
import {
  SubscriptionEntityBuilder,
  SubscriptionItemEntityBuilder,
} from '../../../../test/builders/billing';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import { OperatorAuditEntity } from '../entities/operator-audit.entity';
import { SubscriptionItemEntity } from '../entities/subscription-item.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';

const INTERNAL_KEY = 'integ-operator-key-integ-operator-k'; // ≥32 chars
const PLATFORM_KEY = 'integ-operator-platform-key-integ-op'; // ≥32 chars
const KEYS = { 'X-Internal-Key': INTERNAL_KEY, 'X-Platform-Admin-Key': PLATFORM_KEY };
const OWNER_SLUG = `owner-${uuidv7().slice(-12)}`;
const BODY = { operator: 'Ana Souza', reason: 'abuse report #42' };
const DAY_MS = 24 * 60 * 60 * 1000;

const suspendUrl = (tenantId: string) => `/internal/tenants/${tenantId}/billing/suspend`;
const unsuspendUrl = (tenantId: string) => `/internal/tenants/${tenantId}/billing/unsuspend`;
const graceUrl = (tenantId: string) => `/internal/tenants/${tenantId}/billing/grace`;
const exemptUrl = (tenantId: string) => `/internal/tenants/${tenantId}/billing/exempt`;

describe('InternalBillingOperatorController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let eventBus: RoutingInMemoryEventBus;
  const tenantIds: string[] = [];

  const newTenantId = (): string => {
    const tenantId = uuidv7();
    tenantIds.push(tenantId);
    return tenantId;
  };

  const seedSubscription = async (
    tenantId: string,
    configure: (builder: SubscriptionEntityBuilder) => SubscriptionEntityBuilder,
  ): Promise<SubscriptionEntity> => {
    const entity = configure(new SubscriptionEntityBuilder().withTenantId(tenantId)).build();
    await ds.getRepository(SubscriptionEntity).insert(entity);
    return entity;
  };

  const seedItem = async (
    entity: SubscriptionEntity,
    featureKey: string,
    startsAt: Date,
    endsAt: Date | null,
  ): Promise<void> => {
    await ds
      .getRepository(SubscriptionItemEntity)
      .insert(
        new SubscriptionItemEntityBuilder()
          .withTenantId(entity.tenantId)
          .withSubscriptionId(entity.id)
          .withFeatureKey(featureKey)
          .withStartsAt(startsAt)
          .withEndsAt(endsAt)
          .build(),
      );
  };

  const seedTenant = async (tenantId: string, slug: string): Promise<void> => {
    await ds
      .getRepository(TenantEntity)
      .insert(new TenantEntityBuilder().withId(tenantId).withSlug(slug).build());
  };

  const post = (url: string, body: unknown = BODY) =>
    request(app.getHttpServer())
      .post(url)
      .set(KEYS)
      .send(body as object);

  const subscriptionOf = (tenantId: string) =>
    ds.getRepository(SubscriptionEntity).findOneByOrFail({ tenantId });

  const auditRowsOf = (tenantId: string) =>
    ds.getRepository(OperatorAuditEntity).find({ where: { tenantId } });

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['PLATFORM_OWNER_TENANT_SLUG'] = OWNER_SLUG;
    ({ app, ds, eventBus } = await createBillingIntegrationApp({
      extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
    }));
  });

  afterEach(async () => {
    eventBus.published.length = 0;
    await ds.query(`DELETE FROM "billing"."operator_audit" WHERE "tenant_id" = ANY($1::uuid[])`, [
      tenantIds,
    ]);
    await ds.query(
      `DELETE FROM "billing"."subscription_items" WHERE "tenant_id" = ANY($1::uuid[])`,
      [tenantIds],
    );
    await ds.query(`DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = ANY($1::uuid[])`, [
      tenantIds,
    ]);
    await ds.query(`DELETE FROM "platform"."tenants" WHERE "id" = ANY($1::uuid[])`, [tenantIds]);
    tenantIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
    delete process.env['INTERNAL_API_KEY'];
    delete process.env['PLATFORM_ADMIN_KEY'];
    delete process.env['PLATFORM_OWNER_TENANT_SLUG'];
  });

  describe('guards', () => {
    it('refuses every operator route without both keys (401), accepts both (200)', async () => {
      const tenantId = newTenantId();
      await seedSubscription(tenantId, (b) => b.withStatus('ACTIVE'));
      const server = app.getHttpServer();

      await request(server)
        .post(suspendUrl(tenantId))
        .set('X-Internal-Key', INTERNAL_KEY)
        .send(BODY)
        .expect(401);
      await request(server)
        .post(suspendUrl(tenantId))
        .set('X-Platform-Admin-Key', PLATFORM_KEY)
        .send(BODY)
        .expect(401);
      await request(server)
        .get('/internal/billing/tenants')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(401);
      expect((await subscriptionOf(tenantId)).status).toBe('ACTIVE');

      await post(suspendUrl(tenantId)).expect(200);
    });
  });

  describe('POST suspend', () => {
    it('suspends in one transaction: subscription, audit row naming who and why, and the event', async () => {
      const tenantId = newTenantId();
      await seedSubscription(tenantId, (b) => b.withStatus('ACTIVE'));

      const { body } = await post(suspendUrl(tenantId)).expect(200);

      expect(body).toEqual({
        status: 'SUSPENDED',
        suspensionReason: 'OPERATOR',
        exempt: false,
        graceUntil: null,
      });
      const row = await subscriptionOf(tenantId);
      expect(row).toMatchObject({ status: 'SUSPENDED', suspensionReason: 'OPERATOR' });
      const audits = await auditRowsOf(tenantId);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ actor: 'Ana Souza', action: 'SUSPEND' });
      expect(audits[0]?.payload).toMatchObject({ reason: 'abuse report #42' });
      expect(eventBus.published.map((event) => event.eventName)).toEqual(['SubscriptionSuspended']);
    });

    it('evicts the cached access answer: the next getAccess reflects the suspension', async () => {
      const tenantId = newTenantId();
      await seedSubscription(tenantId, (b) => b.withStatus('ACTIVE'));
      const access = app.get<TenantAccessPort>(TENANT_ACCESS_PORT);
      expect((await access.getAccess(tenantId)).operational).toBe(true); // now cached

      await post(suspendUrl(tenantId)).expect(200);

      expect(await access.getAccess(tenantId)).toMatchObject({
        status: 'SUSPENDED',
        suspensionReason: 'OPERATOR',
        operational: false,
      });
    });

    it('refuses an exempt tenant with 403 BILLING_EXEMPT_PROTECTED and writes nothing', async () => {
      const tenantId = newTenantId();
      await seedSubscription(tenantId, (b) => b.withStatus('ACTIVE').withExempt(true));

      const { body } = await post(suspendUrl(tenantId)).expect(403);

      expect(body.code).toBe(BillingErrorCode.EXEMPT_PROTECTED);
      expect(await auditRowsOf(tenantId)).toHaveLength(0);
      expect(eventBus.published).toHaveLength(0);
    });

    it('answers 400 for a missing, blank or over-long operator or reason', async () => {
      const tenantId = newTenantId();
      await seedSubscription(tenantId, (b) => b.withStatus('ACTIVE'));

      await post(suspendUrl(tenantId), { operator: 'Ana' }).expect(400);
      await post(suspendUrl(tenantId), { reason: 'x' }).expect(400);
      await post(suspendUrl(tenantId), { operator: '  ', reason: 'x' }).expect(400);
      await post(suspendUrl(tenantId), { operator: 'Ana', reason: 'x'.repeat(501) }).expect(400);
      expect((await subscriptionOf(tenantId)).status).toBe('ACTIVE');
    });

    it("never touches another tenant's subscription or audit rows", async () => {
      const tenantA = newTenantId();
      const tenantB = newTenantId();
      await seedSubscription(tenantA, (b) => b.withStatus('ACTIVE'));
      await seedSubscription(tenantB, (b) => b.withStatus('ACTIVE'));

      await post(suspendUrl(tenantA)).expect(200);

      expect((await subscriptionOf(tenantB)).status).toBe('ACTIVE');
      expect(await auditRowsOf(tenantB)).toHaveLength(0);
    });

    it('answers 404 for a tenant with no subscription', async () => {
      await post(suspendUrl(uuidv7())).expect(404);
    });
  });

  describe('POST unsuspend', () => {
    it('lifts an OPERATOR suspension and publishes SubscriptionReactivated with the span start', async () => {
      const tenantId = newTenantId();
      const suspendedAt = new Date(Date.now() - 3 * DAY_MS);
      await seedSubscription(tenantId, (b) =>
        b.withStatus('SUSPENDED').withSuspension('OPERATOR', suspendedAt).withTrialEndsAt(null),
      );

      const { body } = await post(unsuspendUrl(tenantId)).expect(200);

      expect(body).toMatchObject({ status: 'ACTIVE', suspensionReason: null });
      expect((await auditRowsOf(tenantId))[0]).toMatchObject({ action: 'UNSUSPEND' });
      expect(eventBus.published).toHaveLength(1);
      expect(eventBus.published[0]).toMatchObject({
        eventName: 'SubscriptionReactivated',
        data: { suspendedAt: suspendedAt.toISOString() },
      });
    });

    it('refuses a payment-based suspension with 409 BILLING_UNSUSPEND_NOT_ALLOWED', async () => {
      const tenantId = newTenantId();
      await seedSubscription(tenantId, (b) =>
        b.withStatus('SUSPENDED').withSuspension('NON_PAYMENT', new Date(Date.now() - DAY_MS)),
      );

      const { body } = await post(unsuspendUrl(tenantId)).expect(409);

      expect(body.code).toBe(BillingErrorCode.UNSUSPEND_NOT_ALLOWED);
      expect((await subscriptionOf(tenantId)).status).toBe('SUSPENDED');
    });
  });

  describe('POST grace', () => {
    it('sets graceUntil on a PAST_DUE tenant and audits it', async () => {
      const tenantId = newTenantId();
      await seedSubscription(tenantId, (b) =>
        b.withStatus('PAST_DUE').withPastDueSince(new Date(Date.now() - 2 * DAY_MS)),
      );
      const graceUntil = new Date(Date.now() + 30 * DAY_MS).toISOString();

      const { body } = await post(graceUrl(tenantId), { ...BODY, graceUntil }).expect(200);

      expect(body.graceUntil).toBe(graceUntil);
      expect((await auditRowsOf(tenantId))[0]).toMatchObject({ action: 'GRACE' });
    });

    it('refuses a tenant that is not PAST_DUE with 409 BILLING_GRACE_NOT_ALLOWED', async () => {
      const tenantId = newTenantId();
      await seedSubscription(tenantId, (b) => b.withStatus('ACTIVE'));

      const { body } = await post(graceUrl(tenantId), {
        ...BODY,
        graceUntil: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      }).expect(409);

      expect(body.code).toBe(BillingErrorCode.GRACE_NOT_ALLOWED);
    });
  });

  describe('PUT exempt', () => {
    const put = (tenantId: string, exempt: boolean) =>
      request(app.getHttpServer())
        .put(exemptUrl(tenantId))
        .set(KEYS)
        .send({ ...BODY, exempt });

    it('set on a TRIALING tenant holding the default paid items swaps them for open-ended items without tripping the GIST exclusion', async () => {
      const tenantId = newTenantId();
      const trialEndsAt = new Date(Date.now() + 10 * DAY_MS);
      const entity = await seedSubscription(tenantId, (b) =>
        b.withStatus('TRIALING').withTrialEndsAt(trialEndsAt),
      );
      for (const featureKey of FEATURE_KEYS) {
        await seedItem(entity, featureKey, trialEndsAt, null); // S11's default: starts at trial end
      }

      const { body } = await put(tenantId, true).expect(200);

      expect(body).toMatchObject({ status: 'ACTIVE', exempt: true });
      const items = await ds.getRepository(SubscriptionItemEntity).find({ where: { tenantId } });
      expect(items).toHaveLength(FEATURE_KEYS.length); // the not-yet-started ones were removed
      expect(items.every((item) => item.endsAt === null)).toBe(true);
      expect(items.every((item) => item.startsAt.getTime() < trialEndsAt.getTime())).toBe(true);
      expect(new Set(items.map((item) => item.featureKey)).size).toBe(FEATURE_KEYS.length);
    });

    it('set on an ACTIVE tenant with running items end-dates them at now and starts the new items at now', async () => {
      const tenantId = newTenantId();
      const entity = await seedSubscription(tenantId, (b) =>
        b.withStatus('ACTIVE').withTrialEndsAt(null),
      );
      const runningSince = new Date(Date.now() - 20 * DAY_MS);
      await seedItem(entity, 'HOTSITE', runningSince, null);

      await put(tenantId, true).expect(200);

      const items = await ds
        .getRepository(SubscriptionItemEntity)
        .find({ where: { tenantId, featureKey: 'HOTSITE' }, order: { startsAt: 'ASC' } });
      expect(items).toHaveLength(2);
      const [old, fresh] = items;
      expect(old?.endsAt).not.toBeNull();
      expect(fresh?.endsAt).toBeNull();
      expect(fresh?.startsAt.getTime()).toBe(old?.endsAt?.getTime()); // touching, never overlapping
    });

    it('set on a SUSPENDED tenant reactivates it without payment and publishes SubscriptionReactivated', async () => {
      const tenantId = newTenantId();
      const suspendedAt = new Date(Date.now() - 5 * DAY_MS);
      await seedSubscription(tenantId, (b) =>
        b.withStatus('SUSPENDED').withSuspension('NON_PAYMENT', suspendedAt),
      );

      const { body } = await put(tenantId, true).expect(200);

      expect(body).toMatchObject({ status: 'ACTIVE', suspensionReason: null, exempt: true });
      expect(eventBus.published[0]).toMatchObject({
        eventName: 'SubscriptionReactivated',
        data: { suspendedAt: suspendedAt.toISOString() },
      });
    });

    it('clear puts an exempt tenant on a fresh trial and audits it', async () => {
      const tenantId = newTenantId();
      await seedTenant(tenantId, `lava-${uuidv7().slice(-10)}`);
      await seedSubscription(tenantId, (b) => b.withStatus('ACTIVE').withExempt(true));

      const { body } = await put(tenantId, false).expect(200);

      expect(body).toMatchObject({ status: 'TRIALING', exempt: false });
      expect((await subscriptionOf(tenantId)).trialEndsAt).not.toBeNull();
      expect((await auditRowsOf(tenantId))[0]).toMatchObject({ action: 'SET_EXEMPT' });
    });

    it("refuses to clear exempt on Ikaro's own tenant with 403 and no audit row", async () => {
      const tenantId = newTenantId();
      await seedTenant(tenantId, OWNER_SLUG);
      await seedSubscription(tenantId, (b) => b.withStatus('ACTIVE').withExempt(true));

      const { body } = await put(tenantId, false).expect(403);

      expect(body.code).toBe(BillingErrorCode.EXEMPT_PROTECTED);
      expect((await subscriptionOf(tenantId)).exempt).toBe(true);
      expect(await auditRowsOf(tenantId)).toHaveLength(0);
    });
  });

  describe('racing requests (the lock itself is pinned by suspend-tenant-by-operator.use-case.lock.integration)', () => {
    it('a suspend racing an exempt-set never leaves a suspended-and-exempt row', async () => {
      const tenantId = newTenantId();
      await seedSubscription(tenantId, (b) => b.withStatus('ACTIVE'));

      const [suspend, exempt] = await Promise.all([
        post(suspendUrl(tenantId)),
        request(app.getHttpServer())
          .put(exemptUrl(tenantId))
          .set(KEYS)
          .send({ ...BODY, exempt: true }),
      ]);

      // Either order is valid: suspend first, then exempt reactivates; or exempt first, then the
      // suspend is refused. What can never happen is a lost update.
      expect(exempt.status).toBe(200);
      expect([200, 403]).toContain(suspend.status);
      const row = await subscriptionOf(tenantId);
      expect(row).toMatchObject({ status: 'ACTIVE', exempt: true, suspensionReason: null });
      const audits = await auditRowsOf(tenantId);
      expect(audits).toHaveLength(suspend.status === 200 ? 2 : 1);
    });
  });

  describe('GET /internal/billing/tenants', () => {
    it('lists subscription-derived rows, newest first, paginated, narrowed by status', async () => {
      const first = newTenantId();
      const second = newTenantId();
      const third = newTenantId();
      await seedSubscription(first, (b) => b.withStatus('ACTIVE'));
      await seedSubscription(second, (b) => b.withStatus('PAST_DUE'));
      await seedSubscription(third, (b) => b.withStatus('ACTIVE'));

      const { body } = await request(app.getHttpServer())
        .get('/internal/billing/tenants')
        .query({ status: 'ACTIVE', limit: 100 })
        .set(KEYS)
        .expect(200);

      const ours = body.items.filter((item: { tenantId: string }) =>
        [first, second, third].includes(item.tenantId),
      );
      expect(ours.map((item: { tenantId: string }) => item.tenantId)).toEqual([third, first]);
      expect(ours[0]).toEqual(
        expect.objectContaining({ status: 'ACTIVE', exempt: false, hasEverPaid: false }),
      );
      expect(Object.keys(ours[0]).sort()).toEqual(
        [
          'exempt',
          'graceUntil',
          'hasEverPaid',
          'pastDueSince',
          'status',
          'suspendedAt',
          'suspensionReason',
          'tenantId',
          'trialEndsAt',
        ].sort(),
      );
      const paged = await request(app.getHttpServer())
        .get('/internal/billing/tenants')
        .query({ limit: 1, offset: 0 })
        .set(KEYS)
        .expect(200);
      expect(paged.body.items).toHaveLength(1);
      expect(paged.body.pagination).toMatchObject({ limit: 1, offset: 0, hasMore: true });
    });

    it('answers 400 for an out-of-range limit or offset and an unknown status', async () => {
      const server = app.getHttpServer();
      await request(server)
        .get('/internal/billing/tenants')
        .query({ limit: 0 })
        .set(KEYS)
        .expect(400);
      await request(server)
        .get('/internal/billing/tenants')
        .query({ limit: 101 })
        .set(KEYS)
        .expect(400);
      await request(server)
        .get('/internal/billing/tenants')
        .query({ offset: -1 })
        .set(KEYS)
        .expect(400);
      await request(server)
        .get('/internal/billing/tenants')
        .query({ status: 'BOGUS' })
        .set(KEYS)
        .expect(400);
    });
  });
});
