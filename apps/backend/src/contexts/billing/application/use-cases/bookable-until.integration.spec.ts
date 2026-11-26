import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  TENANT_ACCESS_PORT,
  type TenantAccessPort,
} from '../../../../shared/ports/tenant-access.port';
import {
  addDaysUTC,
  localDateStartUTC,
  todayInTimezone,
} from '../../../../shared/utils/calendar-date';
import {
  SubscriptionEntityBuilder,
  SubscriptionItemEntityBuilder,
} from '../../../../test/builders/billing';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import { SubscriptionItemEntity } from '../../infrastructure/entities/subscription-item.entity';
import { SubscriptionEntity } from '../../infrastructure/entities/subscription.entity';

const TIMEZONE = 'America/Sao_Paulo';
const DAY_MS = 24 * 60 * 60 * 1000;

// M26-S18b: the cap derived from REAL subscription rows, and the uncached read Booking takes
// inside its write transaction. The Booking route suites seed the in-memory access port; this one
// proves the real source.
describe('the BOOKING cap from real subscription rows (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let access: TenantAccessPort;
  const tenantIds: string[] = [];

  // Tenant-local midnight `days` days from today, so the expected date never depends on the UTC day.
  const localMidnightIn = (days: number) =>
    localDateStartUTC(addDaysUTC(todayInTimezone(TIMEZONE), days), TIMEZONE);

  beforeAll(async () => {
    ({ app, ds } = await createBillingIntegrationApp());
    access = app.get<TenantAccessPort>(TENANT_ACCESS_PORT);
  });

  afterEach(async () => {
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
  });

  async function seed(
    configure: (builder: SubscriptionEntityBuilder) => SubscriptionEntityBuilder,
    items: { featureKey: string; startsAt: Date; endsAt: Date | null }[],
  ): Promise<string> {
    const tenantId = uuidv7();
    tenantIds.push(tenantId);
    await ds
      .getRepository(TenantEntity)
      .insert(new TenantEntityBuilder().withId(tenantId).withSlug(`cap-${uuidv7()}`).build());
    const entity = configure(new SubscriptionEntityBuilder().withTenantId(tenantId)).build();
    await ds.getRepository(SubscriptionEntity).insert(entity);
    for (const item of items) {
      await ds
        .getRepository(SubscriptionItemEntity)
        .insert(
          new SubscriptionItemEntityBuilder()
            .withTenantId(tenantId)
            .withSubscriptionId(entity.id)
            .withFeatureKey(item.featureKey)
            .withStartsAt(item.startsAt)
            .withEndsAt(item.endsAt)
            .build(),
        );
    }
    return tenantId;
  }

  const longAgo = () => new Date(Date.now() - 30 * DAY_MS);

  it('a running BOOKING item scheduled to end gives its tenant-local end date, on the access answer and on the uncached read', async () => {
    const endsAt = localMidnightIn(5);
    const expected = addDaysUTC(todayInTimezone(TIMEZONE), 5);
    const tenantId = await seed(
      (b) => b.withStatus('ACTIVE'),
      [{ featureKey: 'BOOKING', startsAt: longAgo(), endsAt }],
    );

    expect((await access.getAccess(tenantId)).bookableUntil).toBe(expected);
    expect(await access.getBookableUntil(tenantId)).toBe(expected);
  });

  it('a trial whose first paid period omits BOOKING is capped at the trial end', async () => {
    const trialEndsAt = localMidnightIn(7);
    const tenantId = await seed(
      (b) => b.withStatus('TRIALING').withTrialEndsAt(trialEndsAt),
      [{ featureKey: 'HOTSITE', startsAt: trialEndsAt, endsAt: null }],
    );

    expect(await access.getBookableUntil(tenantId)).toBe(addDaysUTC(todayInTimezone(TIMEZONE), 7));
    expect((await access.getAccess(tenantId)).features.map((f) => f.key)).toContain('BOOKING');
  });

  it('a tenant with no removal pending has no cap, and the answer carries no field for it', async () => {
    const tenantId = await seed(
      (b) => b.withStatus('ACTIVE'),
      [{ featureKey: 'BOOKING', startsAt: longAgo(), endsAt: null }],
    );

    expect(await access.getBookableUntil(tenantId)).toBeNull();
    expect(await access.getAccess(tenantId)).not.toHaveProperty('bookableUntil');
  });

  it('the uncached read sees a removal saved after the cached answer was read; the cached one still lags', async () => {
    const tenantId = await seed(
      (b) => b.withStatus('ACTIVE'),
      [{ featureKey: 'BOOKING', startsAt: longAgo(), endsAt: null }],
    );
    expect(await access.getAccess(tenantId)).not.toHaveProperty('bookableUntil'); // now cached

    // The removal is saved by another instance: the row changes, this instance's cache is stale.
    await ds.query(
      `UPDATE "billing"."subscription_items" SET "ends_at" = $2 WHERE "tenant_id" = $1 AND "feature_key" = 'BOOKING'`,
      [tenantId, localMidnightIn(3)],
    );

    expect(await access.getBookableUntil(tenantId)).toBe(addDaysUTC(todayInTimezone(TIMEZONE), 3));
    expect(await access.getAccess(tenantId)).not.toHaveProperty('bookableUntil');
  });

  it('is scoped by tenant: one tenant pending removal never caps another', async () => {
    const capped = await seed(
      (b) => b.withStatus('ACTIVE'),
      [{ featureKey: 'BOOKING', startsAt: longAgo(), endsAt: localMidnightIn(2) }],
    );
    const other = await seed(
      (b) => b.withStatus('ACTIVE'),
      [{ featureKey: 'BOOKING', startsAt: longAgo(), endsAt: null }],
    );

    expect(await access.getBookableUntil(capped)).not.toBeNull();
    expect(await access.getBookableUntil(other)).toBeNull();
  });

  it('a suspended subscription has no cap: the entitlement gate already blocks it', async () => {
    const tenantId = await seed(
      (b) => b.withSuspension('NON_PAYMENT', new Date()),
      [{ featureKey: 'BOOKING', startsAt: longAgo(), endsAt: localMidnightIn(2) }],
    );

    expect(await access.getBookableUntil(tenantId)).toBeNull();
  });

  it('a tenant without a subscription has no cap', async () => {
    expect(await access.getBookableUntil(uuidv7())).toBeNull();
  });
});
