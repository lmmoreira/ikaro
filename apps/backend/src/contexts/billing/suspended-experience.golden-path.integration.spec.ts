import { ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { BillingErrorCode } from '@ikaro/types';
import { Envelope } from '../../shared/domain/envelope';
import { uuidv7 } from '../../shared/domain/uuid-v7';
import { ErrorFilter } from '../../shared/filters/error.filter';
import { InternalApiGuard } from '../../shared/guards/internal-api.guard';
import { TenantAccessGuard } from '../../shared/guards/tenant-access.guard';
import { EVENT_BUS, IEventBus } from '../../shared/ports/event-bus.port';
import { TENANT_ACCESS_PORT, TenantAccessPort } from '../../shared/ports/tenant-access.port';
import { SubscriptionEntityBuilder } from '../../test/builders/billing';
import { HotsiteConfigEntityBuilder, TenantEntityBuilder } from '../../test/builders/platform';
import { createSuspendedExperienceApp } from '../../test/utils/suspended-experience-integration-app';
import { waitFor } from '../../test/utils/wait-for';
import { BookingCompletionController } from '../booking/infrastructure/controllers/booking-completion.controller';
import { BookingController } from '../booking/infrastructure/controllers/booking.controller';
import { HotsiteConfigEntity } from '../platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../platform/infrastructure/entities/tenant.entity';
import { OperatorAuditEntity } from './infrastructure/entities/operator-audit.entity';
import { SubscriptionEntity } from './infrastructure/entities/subscription.entity';

const INTERNAL_KEY = 'integ-golden-path-key-integ-golden-p'; // ≥32 chars
const PLATFORM_KEY = 'integ-golden-platform-key-integ-gol'; // ≥32 chars
const OWNER_SLUG = `owner-${uuidv7().slice(-12)}`;
const CORRELATION_ID = uuidv7();
const KEYS = {
  'X-Internal-Key': INTERNAL_KEY,
  'X-Platform-Admin-Key': PLATFORM_KEY,
  'X-Correlation-ID': CORRELATION_ID,
};
const BODY = { operator: 'Ana Souza', reason: 'abuse report #42' };

/** A stand-in for a notification-style event: a subscriber to it is gated exactly like a real one. */
class GoldenPathProbeEvent extends Envelope {
  readonly eventVersion = 1;
  readonly data = {};
  constructor(tenantId: string) {
    super(tenantId, CORRELATION_ID);
  }
}

describe('Suspended experience — golden path (M25-S26, backend half)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let access: TenantAccessPort;
  let revalidatedSlugs: string[];
  let bus: IEventBus;
  const gatedDeliveries: string[] = [];
  const stateSyncDeliveries: string[] = [];
  const tenantIds: string[] = [];

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['PLATFORM_OWNER_TENANT_SLUG'] = OWNER_SLUG;
    const harness = await createSuspendedExperienceApp([
      { provide: APP_FILTER, useClass: ErrorFilter },
      { provide: APP_GUARD, useClass: InternalApiGuard },
      { provide: APP_GUARD, useClass: TenantAccessGuard },
    ]);
    ({ app, ds } = harness);
    revalidatedSlugs = harness.revalidation.revalidatedSlugs;
    access = app.get<TenantAccessPort>(TENANT_ACCESS_PORT);
    bus = app.get<IEventBus>(EVENT_BUS);
    // The real `GatedEventBus`: the first subscriber is a notification-style one (skipped while
    // suspended, S21a), the second a state-sync one that always runs.
    bus.subscribe<GoldenPathProbeEvent>(
      GoldenPathProbeEvent.name,
      async (event) => void gatedDeliveries.push(event.tenantId),
      'golden-path-notification',
      { skipWhenSuspended: true },
    );
    bus.subscribe<GoldenPathProbeEvent>(
      GoldenPathProbeEvent.name,
      async (event) => void stateSyncDeliveries.push(event.tenantId),
      'golden-path-state-sync',
      { skipWhenSuspended: false },
    );
  });

  afterAll(async () => {
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
    await ds.query(`DELETE FROM "platform"."hotsite_configs" WHERE "tenant_id" = ANY($1::uuid[])`, [
      tenantIds,
    ]);
    await ds.query(`DELETE FROM "platform"."tenants" WHERE "id" = ANY($1::uuid[])`, [tenantIds]);
    await app.close();
    delete process.env['INTERNAL_API_KEY'];
    delete process.env['PLATFORM_ADMIN_KEY'];
    delete process.env['PLATFORM_OWNER_TENANT_SLUG'];
  });

  const seedTenant = async (): Promise<{ tenantId: string; slug: string }> => {
    const tenantId = uuidv7();
    const slug = `golden-${tenantId.slice(-12)}`;
    tenantIds.push(tenantId);
    await ds
      .getRepository(TenantEntity)
      .insert(new TenantEntityBuilder().withId(tenantId).withSlug(slug).build());
    await ds
      .getRepository(HotsiteConfigEntity)
      .insert(
        new HotsiteConfigEntityBuilder().withTenantId(tenantId).withIsPublished(true).build(),
      );
    // A trial, as a provisioned tenant starts (registration → provisioning → trial is S09 to S11's
    // own coverage); the access answer is derived from this real subscription.
    await ds
      .getRepository(SubscriptionEntity)
      .insert(
        new SubscriptionEntityBuilder().withTenantId(tenantId).withStatus('TRIALING').build(),
      );
    return { tenantId, slug };
  };

  const operator = (tenantId: string, action: 'suspend' | 'unsuspend') =>
    request(app.getHttpServer())
      .post(`/internal/tenants/${tenantId}/billing/${action}`)
      .set(KEYS)
      .send(BODY);

  const accessAnswer = (tenantId: string) =>
    request(app.getHttpServer())
      .get(`/internal/billing/tenants/${tenantId}/access`)
      .set('X-Internal-Key', INTERNAL_KEY);

  const manifest = (tenantId: string) =>
    request(app.getHttpServer())
      .get('/hotsite')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Tenant-ID', tenantId);

  const publishedSlugs = async (): Promise<string[]> => {
    const { body } = await request(app.getHttpServer())
      .get('/internal/tenants/published-hotsites')
      .set('X-Internal-Key', INTERNAL_KEY)
      .expect(200);
    return (body.items as Array<{ slug: string }>).map((item) => item.slug);
  };

  // The gate's verdict for a real route handler, from its real metadata and the real access answer.
  const gateVerdict = async (
    controller: { prototype: object; name: string },
    handler: string,
    tenantId: string,
    role: string,
  ): Promise<'allowed' | BillingErrorCode> => {
    const guard = new TenantAccessGuard(new Reflector(), access);
    const context = {
      getHandler: () => (controller.prototype as Record<string, () => void>)[handler],
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-tenant-id': tenantId, 'x-actor-role': role } }),
      }),
    } as unknown as ExecutionContext;
    try {
      await guard.canActivate(context);
      return 'allowed';
    } catch (err) {
      const response = (err as { getResponse?: () => { code?: BillingErrorCode } }).getResponse?.();
      return response?.code ?? BillingErrorCode.TENANT_SUSPENDED;
    }
  };

  const snapshot = async (tenantId: string): Promise<unknown> => {
    const [tenant] = await ds.query(`SELECT * FROM "platform"."tenants" WHERE "id" = $1`, [
      tenantId,
    ]);
    const [hotsite] = await ds.query(
      `SELECT "is_published", "branding", "layout" FROM "platform"."hotsite_configs" WHERE "tenant_id" = $1`,
      [tenantId],
    );
    const templates = await ds.query(
      `SELECT "id" FROM "notification"."notification_templates" WHERE "tenant_id" = $1 ORDER BY "id"`,
      [tenantId],
    );
    return { tenant, hotsite, templates };
  };

  it('suspends a tenant end to end, keeps it reachable, and restores it on unsuspend', async () => {
    const { tenantId, slug } = await seedTenant();
    const { tenantId: otherTenantId, slug: otherSlug } = await seedTenant();
    const before = await snapshot(tenantId);

    // Trial: operational, hotsite published and listed, gated routes open, events delivered.
    expect(await accessAnswer(tenantId).expect(200)).toMatchObject({
      body: { status: 'TRIALING', operational: true },
    });
    expect((await manifest(tenantId).expect(200)).body.isPublished).toBe(true);
    expect(await publishedSlugs()).toContain(slug);
    expect(await gateVerdict(BookingController, 'create', tenantId, 'CUSTOMER')).toBe('allowed');
    await bus.publish(new GoldenPathProbeEvent(tenantId));
    expect(gatedDeliveries).toEqual([tenantId]);

    // The operator suspends it.
    await operator(tenantId, 'suspend').expect(200);

    // The access read reports not operational (the BFF reduces it per role and drops the reason).
    expect((await accessAnswer(tenantId).expect(200)).body).toMatchObject({
      status: 'SUSPENDED',
      operational: false,
    });
    // A gated route is refused, while a customer's future-booking cancel is still allowed (S18a).
    expect(await gateVerdict(BookingController, 'create', tenantId, 'CUSTOMER')).toBe(
      BillingErrorCode.TENANT_SUSPENDED,
    );
    expect(
      await gateVerdict(BookingCompletionController, 'cancelAsCustomer', tenantId, 'CUSTOMER'),
    ).toBe('allowed');
    // A notification-style delivery is skipped (so no email is sent), a state-sync one still runs.
    await bus.publish(new GoldenPathProbeEvent(tenantId));
    expect(gatedDeliveries).toEqual([tenantId]);
    expect(stateSyncDeliveries).toEqual([tenantId, tenantId]);
    // The hotsite reads effectively unpublished (200, branding kept) and drops off the list; the
    // manager's own flag is untouched, and Platform revalidates the page.
    const suspendedManifest = await manifest(tenantId).expect(200);
    expect(suspendedManifest.body.isPublished).toBe(false);
    expect(suspendedManifest.body.branding).toBeDefined();
    expect(await publishedSlugs()).not.toContain(slug);
    await waitFor(async () => revalidatedSlugs.includes(slug));

    // Tenant isolation: another tenant is operational and published throughout.
    expect((await accessAnswer(otherTenantId).expect(200)).body.operational).toBe(true);
    expect((await manifest(otherTenantId).expect(200)).body.isPublished).toBe(true);
    expect(await publishedSlugs()).toContain(otherSlug);
    expect(await gateVerdict(BookingController, 'create', otherTenantId, 'CUSTOMER')).toBe(
      'allowed',
    );

    // Unsuspend restores everything.
    revalidatedSlugs.length = 0;
    await operator(tenantId, 'unsuspend').expect(200);

    expect((await accessAnswer(tenantId).expect(200)).body.operational).toBe(true);
    expect(await gateVerdict(BookingController, 'create', tenantId, 'CUSTOMER')).toBe('allowed');
    await bus.publish(new GoldenPathProbeEvent(tenantId));
    expect(gatedDeliveries).toEqual([tenantId, tenantId]);
    expect((await manifest(tenantId).expect(200)).body.isPublished).toBe(true);
    expect(await publishedSlugs()).toContain(slug);
    await waitFor(async () => revalidatedSlugs.includes(slug));

    // Nothing the tenant owns was touched by the suspension.
    expect(await snapshot(tenantId)).toEqual(before);
    expect(await ds.getRepository(OperatorAuditEntity).count({ where: { tenantId } })).toBe(2);
  });
});
