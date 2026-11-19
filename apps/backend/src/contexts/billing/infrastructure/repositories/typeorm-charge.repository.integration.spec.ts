import { DataSource, QueryFailedError } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import {
  ChargeBuilder,
  ChargeLineBuilder,
  SubscriptionEntityBuilder,
} from '../../../../test/builders/billing';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { createTestDataSource } from '../../../../test/test-datasource';
import { waitForBlockedRowLock } from '../../../../test/utils/wait-for-blocked-row-lock';
import { Charge } from '../../domain/charge.aggregate';
import { ChargeAlreadyExistsError } from '../../domain/errors/charge-already-exists.error';
import { ChargeConcurrentModificationError } from '../../domain/errors/charge-concurrent-modification.error';
import { RecoveryChargeAlreadyOpenError } from '../../domain/errors/recovery-charge-already-open.error';
import { ChargeEntity } from '../entities/charge.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { TypeOrmChargeRepository } from './typeorm-charge.repository';

describe('TypeOrmChargeRepository (integration)', () => {
  let dataSource: DataSource;
  let txManager: TypeOrmTransactionManager;
  let repo: TypeOrmChargeRepository;
  let outbox: InMemoryOutboxPublisher;
  // A fresh tenant (and subscription) per scenario: nothing is shared, so a failing scenario
  // leaves nothing another test can trip over; rows are deleted after each test.
  const tenants: string[] = [];

  const newTenant = async (): Promise<{ tenantId: string; subscriptionId: string }> => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    const subscription = new SubscriptionEntityBuilder().withTenantId(tenantId).build();
    await dataSource.getRepository(SubscriptionEntity).insert(subscription);
    return { tenantId, subscriptionId: subscription.id };
  };

  const period = (t: { tenantId: string; subscriptionId: string }, start = '2026-05-01'): Charge =>
    new ChargeBuilder()
      .withTenantId(t.tenantId)
      .withSubscriptionId(t.subscriptionId)
      .withPeriod(start, '2026-05-31')
      .withVersion(undefined)
      .build();

  const recovery = (t: { tenantId: string; subscriptionId: string }): Charge =>
    new ChargeBuilder()
      .withTenantId(t.tenantId)
      .withSubscriptionId(t.subscriptionId)
      .asRecovery()
      .withVersion(undefined)
      .build();

  const save = (charge: Charge): Promise<void> => txManager.run(() => repo.save(charge));

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(dataSource);
    outbox = new InMemoryOutboxPublisher();
    repo = new TypeOrmChargeRepository(dataSource.getRepository(ChargeEntity), outbox);
  });

  afterEach(async () => {
    if (tenants.length > 0) {
      for (const table of ['charge_lines', 'charges', 'subscription_items', 'subscriptions']) {
        await dataSource.query(`DELETE FROM billing.${table} WHERE tenant_id = ANY($1::uuid[])`, [
          tenants,
        ]);
      }
      tenants.length = 0;
    }
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('round trip and uniqueness', () => {
    it('round-trips a new charge with its lines and amounts', async () => {
      const t = await newTenant();
      const lines = [
        new ChargeLineBuilder().withFeatureKey('HOTSITE').withUnitPriceMinor(4900).build(),
        new ChargeLineBuilder().withFeatureKey('BOOKING').withUnitPriceMinor(10900).build(),
      ];
      const created = new ChargeBuilder()
        .withTenantId(t.tenantId)
        .withSubscriptionId(t.subscriptionId)
        .withLines(lines)
        .withVersion(undefined)
        .build();

      await save(created);
      const found = await repo.findById(t.tenantId, created.id);

      expect(found?.version).toBe(0);
      expect(found?.status).toBe('PENDING');
      expect(found?.kind).toBe('PERIOD');
      expect(found?.subtotal.amountMinor).toBe(15800);
      expect(found?.amount.amountMinor).toBe(15800);
      expect(found?.amount.currency).toBe('BRL');
      expect(found?.merchantProfileKey).toBe('BRL_FAKE');
      expect(found?.periodStart?.value).toBe(created.periodStart?.value);
      expect(found?.dueDate.value).toBe(created.dueDate.value);
      expect(found?.lines.map((l) => [l.featureKey, l.unitPriceMinor])).toEqual([
        ['BOOKING', 10900],
        ['HOTSITE', 4900],
      ]);
    });

    it('UNIQUE(tenant, subscription, period_start) rejects a second period charge and ignores a cancelled one', async () => {
      const t = await newTenant();
      const first = period(t);
      await save(first);

      await expect(save(period(t))).rejects.toThrow(ChargeAlreadyExistsError);

      first.cancel();
      await save(first);
      await expect(save(period(t))).resolves.toBeUndefined();
    });

    it('a recovery charge may be opened again once the previous one is no longer open', async () => {
      const t = await newTenant();
      const first = recovery(t);
      await save(first);
      first.cancel();
      await save(first);

      await expect(save(recovery(t))).resolves.toBeUndefined();
    });

    it('rejects a second (provider, provider_charge_id) with the standalone unique', async () => {
      const t = await newTenant();
      const a = period(t, '2026-05-01');
      const b = period(t, '2026-06-01');
      await save(a);
      await save(b);
      a.markCreationReady('ASAAS', 'pay_dup', 'https://pay.example/a', null);
      b.markCreationReady('ASAAS', 'pay_dup', 'https://pay.example/b', null);
      await save(a);

      await expect(save(b)).rejects.toThrow(QueryFailedError);
    });

    it('the CHECK refuses a READY charge with no provider charge id', async () => {
      const t = await newTenant();
      const charge = period(t);
      await save(charge);

      await expect(
        dataSource.query(
          `UPDATE billing.charges SET provider_creation_status = 'READY' WHERE id = $1`,
          [charge.id],
        ),
      ).rejects.toThrow(/CHK_billing_charges_provider_ready/);
    });
  });

  describe('concurrency', () => {
    it('UQ_billing_charges_open_recovery: two simultaneous recovery saves leave exactly one open recovery charge; the loser reads it', async () => {
      const t = await newTenant();

      const results = await Promise.allSettled([save(recovery(t)), save(recovery(t))]);

      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(RecoveryChargeAlreadyOpenError);
      const open = await repo.findOpenRecoveryBySubscription(t.tenantId, t.subscriptionId);
      expect(open?.status).toBe('PENDING');
      expect(await repo.findOpenByTenant(t.tenantId)).toHaveLength(1);
    });

    it('B-C1: findByIdForUpdate serialises two lockers: the second parks until the first commits, then sees its committed state', async () => {
      const t = await newTenant();
      const charge = period(t);
      await save(charge);
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));

      let markReady!: () => void;
      const ready = new Promise<void>((resolve) => (markReady = resolve));

      // The holder signals once it has written OVERDUE while its transaction still owns the row.
      const holder = txManager.run(async () => {
        const locked = await repo.findByIdForUpdate(t.tenantId, charge.id);
        locked?.markOverdue();
        if (locked) await repo.save(locked);
        markReady();
        await held;
      });
      // Racing the holder: a failure before the signal rejects instead of hanging.
      await Promise.race([ready, holder]);
      const waiter = txManager.run(async () => {
        const seen = await repo.findByIdForUpdate(t.tenantId, charge.id);
        return seen?.status;
      });
      // Released in a `finally`: a failed wait must not leave the holder's transaction open.
      try {
        // The entity alias opens the SELECT list; the FROM clause is past Postgres' 1024-character
        // truncation of `pg_stat_activity.query` for this wide table.
        await waitForBlockedRowLock(dataSource, '"ChargeEntity"."id"');
      } finally {
        release();
        await Promise.all([holder, waiter]);
      }

      expect(await waiter).toBe('OVERDUE');
    });

    it('findByIdForUpdate throws outside a transaction', async () => {
      await expect(repo.findByIdForUpdate(uuidv7(), uuidv7())).rejects.toThrow(
        'must be called inside an active transaction',
      );
    });
  });

  describe('version', () => {
    it('a stale aggregate cannot overwrite a newer write: ChargeConcurrentModificationError', async () => {
      const t = await newTenant();
      const created = period(t);
      await save(created);
      const first = await repo.findById(t.tenantId, created.id);
      const second = await repo.findById(t.tenantId, created.id);
      first?.markOverdue();
      second?.cancel();

      await save(first as Charge);

      await expect(save(second as Charge)).rejects.toThrow(ChargeConcurrentModificationError);
      expect((await repo.findById(t.tenantId, created.id))?.status).toBe('OVERDUE');
      expect(first?.version).toBe(1);
    });

    it('a webhook paid result is never overwritten by a stale READY write (the race B-C1 and the version close)', async () => {
      const t = await newTenant();
      const created = period(t);
      await save(created);
      const creator = await repo.findById(t.tenantId, created.id);
      const webhook = await repo.findById(t.tenantId, created.id);
      webhook?.markPaid('PIX', new Date(), null, 'corr-int', null);
      await save(webhook as Charge);
      creator?.markCreationReady('ASAAS', 'pay_1', 'https://pay.example/1', null);

      await expect(save(creator as Charge)).rejects.toThrow(ChargeConcurrentModificationError);

      const reread = await txManager.run(() => repo.findByIdForUpdate(t.tenantId, created.id));
      reread?.markCreationReady('ASAAS', 'pay_1', 'https://pay.example/1', null);
      await save(reread as Charge);
      const final = await repo.findById(t.tenantId, created.id);
      expect([final?.status, final?.providerChargeId]).toEqual(['PAID', 'pay_1']);
    });

    it('findByIdForJob finds a charge by its own id with no tenant context, lines included', async () => {
      const t = await newTenant();
      const created = period(t);
      await save(created);

      const found = await repo.findByIdForJob(created.id);

      expect(found?.tenantId).toBe(t.tenantId);
      expect(found?.lines).toHaveLength(created.lines.length);
      expect(await repo.findByIdForJob(uuidv7())).toBeNull();
    });

    it('a paid charge drains ChargePaid to the outbox only when the transaction commits its save', async () => {
      const t = await newTenant();
      const created = period(t);
      await save(created);
      const loaded = await repo.findById(t.tenantId, created.id);
      outbox.published.length = 0; // the outbox is shared by every test of this file
      loaded?.markPaid('PIX', new Date(), null, 'corr-int', 'a@example.test');

      await save(loaded as Charge);

      expect(outbox.published.map((event) => event.eventName)).toEqual(['ChargePaid']);
    });

    it('migration 1748500000046 gives an existing row version 0', async () => {
      const t = await newTenant();
      const charge = period(t);
      await save(charge);

      const [row] = await dataSource.query<{ version: number }[]>(
        `SELECT version FROM billing.charges WHERE id = $1`,
        [charge.id],
      );

      expect(row?.version).toBe(0);
    });
  });
});
