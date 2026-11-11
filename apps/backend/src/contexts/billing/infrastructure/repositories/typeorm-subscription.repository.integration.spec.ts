import { DataSource, QueryFailedError } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { SubscriptionItemEntityBuilder } from '../../../../test/builders/billing';
import { createTestDataSource } from '../../../../test/test-datasource';
import {
  SubscriptionAlreadyExistsError,
  SubscriptionConcurrentModificationError,
} from '../../domain/errors/billing-domain.error';
import { Subscription } from '../../domain/subscription.aggregate';
import { SubscriptionItemEntity } from '../entities/subscription-item.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { TypeOrmSubscriptionRepository } from './typeorm-subscription.repository';

// Polls until some backend is parked on a row lock, pausing inside Postgres (pg_sleep) so no
// test-side timer is involved. Bounded: a lock wait that never appears fails the test instead of
// hanging it.
async function waitForBlockedRowLock(dataSource: DataSource): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt++) {
    const [{ waiting }] = await dataSource.query<{ waiting: number }[]>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (waiting > 0) return;
    await dataSource.query('SELECT pg_sleep(0.01)');
  }
  throw new Error('no transaction ever blocked on the row lock');
}

describe('TypeOrmSubscriptionRepository (integration)', () => {
  let dataSource: DataSource;
  let txManager: TypeOrmTransactionManager;
  let repo: TypeOrmSubscriptionRepository;
  // A fresh tenant per scenario: nothing is shared, so a failing scenario leaves nothing another
  // test can trip over; the rows are deleted (items first: the composite FK) after each test.
  const tenants: string[] = [];

  const newTenant = (): string => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    return tenantId;
  };

  const trialFor = (tenantId: string, start = new Date('2026-01-10T15:00:00Z')): Subscription =>
    Subscription.startTrial({
      tenantId,
      countryCode: CountryCode.create('BR'),
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      merchantProfileKey: 'BRL_FAKE',
      start,
    });

  const save = (subscription: Subscription): Promise<void> =>
    txManager.run(() => repo.save(subscription));

  const reload = async (tenantId: string): Promise<Subscription> => {
    const found = await repo.findByTenantId(tenantId);
    if (!found) throw new Error('expected the subscription to exist');
    return found;
  };

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(dataSource);
    repo = new TypeOrmSubscriptionRepository(dataSource.getRepository(SubscriptionEntity));
  });

  afterEach(async () => {
    if (tenants.length > 0) {
      await dataSource.query(
        `DELETE FROM "billing"."subscription_items" WHERE "tenant_id" = ANY($1::uuid[])`,
        [tenants],
      );
      await dataSource.query(
        `DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = ANY($1::uuid[])`,
        [tenants],
      );
      tenants.length = 0;
    }
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('round-trips a new trial subscription and its default items', async () => {
    const tenantId = newTenant();
    const created = trialFor(tenantId);

    await save(created);
    const found = await reload(tenantId);

    expect(found.id).toBe(created.id);
    expect(found.status).toBe('TRIALING');
    expect(found.version).toBe(0);
    expect(found.countryCode.value).toBe('BR');
    expect(found.currency).toBe('BRL');
    expect(found.timezone.value).toBe('America/Sao_Paulo');
    expect(found.anchorDay).toBe(created.anchorDay);
    expect(found.trialEndsAt?.getTime()).toBe(created.trialEndsAt?.getTime());
    expect(found.nextDueDate?.value).toBe(created.nextDueDate?.value);
    expect(found.items).toHaveLength(5);
    expect(
      found.items.every((item) => item.startsAt.getTime() === found.trialEndsAt?.getTime()),
    ).toBe(true);
    expect(found.items.find((item) => item.featureKey === 'CHATBOT')?.tier).toBe('BASIC');
    expect(found.itemsDirty).toBe(false);
  });

  it('persists a status-only change, bumps the version and leaves the item rows untouched', async () => {
    const tenantId = newTenant();
    await save(trialFor(tenantId));
    const loaded = await reload(tenantId);
    const itemIdsBefore = loaded.items.map((item) => item.id).sort();

    loaded.suspendByOperator(new Date('2026-02-01T12:00:00Z'));
    await save(loaded);

    const found = await reload(tenantId);
    expect(found.status).toBe('SUSPENDED');
    expect(found.suspensionReason).toBe('OPERATOR');
    expect(found.suspendedAt?.toISOString()).toBe('2026-02-01T12:00:00.000Z');
    expect(found.version).toBe(1);
    expect(found.items.map((item) => item.id).sort()).toEqual(itemIdsBefore);
  });

  it('returns the typed error when the version moved since the aggregate was read', async () => {
    const tenantId = newTenant();
    await save(trialFor(tenantId));
    const first = await reload(tenantId);
    const second = await reload(tenantId);

    first.suspendByOperator(new Date('2026-02-01T12:00:00Z'));
    await save(first);
    second.suspendByOperator(new Date('2026-02-02T12:00:00Z'));

    await expect(save(second)).rejects.toThrow(SubscriptionConcurrentModificationError);
    expect((await reload(tenantId)).suspendedAt?.toISOString()).toBe('2026-02-01T12:00:00.000Z');
  });

  it('UNIQUE(tenant_id) refuses a second subscription for one tenant', async () => {
    const tenantId = newTenant();
    await save(trialFor(tenantId));

    await expect(save(trialFor(tenantId))).rejects.toThrow(SubscriptionAlreadyExistsError);
    expect(await dataSource.getRepository(SubscriptionEntity).countBy({ tenantId })).toBe(1);
  });

  describe('subscription_items exclusion constraint', () => {
    const insertItem = (
      tenantId: string,
      subscriptionId: string,
      feature: string,
      startsAt: string,
      endsAt: string | null,
    ): Promise<unknown> =>
      dataSource.getRepository(SubscriptionItemEntity).insert(
        new SubscriptionItemEntityBuilder()
          .withTenantId(tenantId)
          .withSubscriptionId(subscriptionId)
          .withFeatureKey(feature)
          .withStartsAt(new Date(startsAt))
          .withEndsAt(endsAt === null ? null : new Date(endsAt))
          .build(),
      );

    it('rejects overlapping windows of one feature', async () => {
      const tenantId = newTenant();
      const subscription = trialFor(tenantId);
      await save(subscription);

      const attempt = insertItem(
        tenantId,
        subscription.id,
        'BOOKING',
        '2027-01-01T00:00:00Z',
        null,
      );

      await expect(attempt).rejects.toBeInstanceOf(QueryFailedError);
      await expect(attempt).rejects.toMatchObject({
        driverError: { constraint: 'EX_billing_subscription_items_window' },
      });
    });

    it('accepts touching windows: the current row may end exactly when its replacement starts', async () => {
      const tenantId = newTenant();
      const subscription = trialFor(tenantId);
      await save(subscription);
      const trialEndsAt = (await reload(tenantId)).trialEndsAt as Date;
      await dataSource.query(
        `UPDATE "billing"."subscription_items" SET "ends_at" = $1
          WHERE "tenant_id" = $2 AND "feature_key" = 'BOOKING'`,
        [new Date(trialEndsAt.getTime() + 86_400_000), tenantId],
      );

      await expect(
        insertItem(
          tenantId,
          subscription.id,
          'BOOKING',
          new Date(trialEndsAt.getTime() + 86_400_000).toISOString(),
          null,
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('item diff on save', () => {
    it('setExempt on a trial deletes the not-yet-started items and inserts the open-ended ones without a GIST violation', async () => {
      const tenantId = newTenant();
      await save(trialFor(tenantId, new Date('2026-11-01T15:00:00Z')));
      const loaded = await reload(tenantId);
      const oldIds = loaded.items.map((item) => item.id);
      const now = new Date('2026-11-05T12:00:00Z');

      loaded.setExempt(now, 'operator-7');
      await save(loaded);

      const found = await reload(tenantId);
      expect(found.exempt).toBe(true);
      expect(found.status).toBe('ACTIVE');
      expect(found.trialEndsAt).toBeNull();
      expect(found.items).toHaveLength(5);
      expect(found.items.some((item) => oldIds.includes(item.id))).toBe(false);
      expect(found.items.every((item) => item.startsAt.getTime() === now.getTime())).toBe(true);
      expect(
        found.items.every((item) => item.endsAt === null && item.createdBy === 'operator-7'),
      ).toBe(true);
    });

    it('setExempt on a paying subscription end-dates the running items at now and opens new ones touching them', async () => {
      const tenantId = newTenant();
      const subscription = trialFor(tenantId, new Date('2026-01-01T15:00:00Z'));
      await save(subscription);
      // The trial ended: the default items are running now.
      const running = await reload(tenantId);
      const now = new Date(running.trialEndsAt!.getTime() + 10 * 86_400_000);

      running.setExempt(now, 'operator-7');
      await save(running);

      const found = await reload(tenantId);
      const ended = found.items.filter((item) => item.endsAt !== null);
      const opened = found.items.filter((item) => item.endsAt === null);
      expect(ended).toHaveLength(5);
      expect(ended.every((item) => item.endsAt?.getTime() === now.getTime())).toBe(true);
      expect(opened).toHaveLength(5);
      expect(opened.every((item) => item.startsAt.getTime() === now.getTime())).toBe(true);
    });

    it('clearExempt end-dates the exempt items and adds default paid items from the new trial end', async () => {
      const tenantId = newTenant();
      const exempt = Subscription.startExempt({
        tenantId,
        countryCode: CountryCode.create('BR'),
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        merchantProfileKey: 'BRL_FAKE',
        start: new Date('2026-01-10T15:00:00Z'),
      });
      await save(exempt);
      const loaded = await reload(tenantId);
      const now = new Date('2026-03-01T15:00:00Z');

      loaded.clearExempt(now, 'operator-7', false);
      await save(loaded);

      const found = await reload(tenantId);
      expect(found.exempt).toBe(false);
      expect(found.status).toBe('TRIALING');
      expect(found.trialEndsAt?.toISOString()).toBe('2026-03-15T03:00:00.000Z');
      expect(found.items).toHaveLength(10);
      expect(found.items.filter((item) => item.endsAt === null)).toHaveLength(5);
    });
  });

  describe('tenant isolation', () => {
    it("never returns another tenant's subscription, locked or not", async () => {
      const tenantA = newTenant();
      const tenantB = newTenant();
      await save(trialFor(tenantA));

      expect(await repo.findByTenantId(tenantB)).toBeNull();
      expect(await txManager.run(() => repo.findByTenantIdForUpdate(tenantB))).toBeNull();
    });

    it("keeps each tenant's items to its own subscription", async () => {
      const tenantA = newTenant();
      const tenantB = newTenant();
      await save(trialFor(tenantA));
      await save(trialFor(tenantB));

      const a = await reload(tenantA);
      const b = await reload(tenantB);

      expect(a.items).toHaveLength(5);
      expect(b.items).toHaveLength(5);
      expect(a.items.some((item) => b.items.some((other) => other.id === item.id))).toBe(false);
    });
  });

  describe('findByTenantIdForUpdate (B-R1)', () => {
    it('refuses to run outside a transaction', async () => {
      await expect(repo.findByTenantIdForUpdate(uuidv7())).rejects.toThrow('active transaction');
    });

    it('serialises two concurrent lockers: the second sees the first’s committed state, no lost update', async () => {
      const tenantId = newTenant();
      await save(trialFor(tenantId));
      const order: string[] = [];
      let firstHasLock!: () => void;
      const firstLocked = new Promise<void>((resolve) => (firstHasLock = resolve));
      let releaseFirst!: () => void;
      const firstReleased = new Promise<void>((resolve) => (releaseFirst = resolve));

      const first = txManager.run(async () => {
        const locked = (await repo.findByTenantIdForUpdate(tenantId))!;
        order.push('first-locked');
        firstHasLock();
        await firstReleased;
        locked.suspendByOperator(new Date('2026-02-01T12:00:00Z'));
        await repo.save(locked);
        order.push('first-committing');
      });
      await firstLocked;
      const second = txManager.run(async () => {
        const locked = (await repo.findByTenantIdForUpdate(tenantId))!;
        order.push(`second-saw-${locked.status}`);
      });
      await waitForBlockedRowLock(dataSource);
      expect(order).toEqual(['first-locked']); // the second is parked on the row lock
      releaseFirst();
      await Promise.all([first, second]);

      expect(order).toEqual(['first-locked', 'first-committing', 'second-saw-SUSPENDED']);
    });
  });
});
