import { DataSource, EntityManager, QueryFailedError, SelectQueryBuilder } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  ChargeBuilder,
  ChargeLineEntityBuilder,
  SubscriptionEntityBuilder,
} from '../../../../test/builders/billing';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { createTestDataSource } from '../../../../test/test-datasource';
import { PROVIDER_CREATION_LEASE_MINUTES } from '../../domain/billing-constants';
import { Charge } from '../../domain/charge.aggregate';
import { ChargeEntity } from '../entities/charge.entity';
import { ChargeLineEntity } from '../entities/charge-line.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { buildPageQuery, buildPendingCreationQuery } from './typeorm-charge.job-queries';
import {
  buildOpenDueBetweenQuery,
  buildOpenDueQuery,
  buildOpenQuery,
  buildOpenRecoveryQuery,
  buildOpenTrialChargesQuery,
  buildProviderCancelPendingQuery,
  buildRecentlyPaidQuery,
} from './typeorm-charge.reconcile-queries';
import { TypeOrmChargeRepository } from './typeorm-charge.repository';

interface PlanNode {
  'Node Type': string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

const collectNodes = (node: PlanNode): PlanNode[] => [
  node,
  ...(node.Plans ?? []).flatMap(collectNodes),
];

const MINUTE = 60_000;

describe('TypeOrmChargeRepository queries, claim and isolation (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmChargeRepository;
  const tenants: string[] = [];

  type Tenant = { tenantId: string; subscriptionId: string };

  const newTenant = async (): Promise<Tenant> => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    const subscription = new SubscriptionEntityBuilder().withTenantId(tenantId).build();
    await dataSource.getRepository(SubscriptionEntity).insert(subscription);
    return { tenantId, subscriptionId: subscription.id };
  };

  const seed = async (t: Tenant, build: (b: ChargeBuilder) => ChargeBuilder): Promise<Charge> => {
    const charge = build(
      new ChargeBuilder().withTenantId(t.tenantId).withSubscriptionId(t.subscriptionId),
    )
      .withVersion(undefined)
      .build();
    await repo.save(charge);
    return charge;
  };

  // Plans the exact SQL the repository runs, with sequential scans disabled for the transaction so
  // a near-empty test table cannot make the planner's choice meaningless. Even then two partial
  // indexes that can both serve a query tie on the statistics of an empty table (an autovacuum
  // `ANALYZE` after other specs' inserts and deletes), so a caller names the competitors to take
  // away: the plan is made in a transaction that is rolled back, and Postgres DDL is transactional.
  // The query is then served by the named index or by no index at all, whatever the statistics say.
  const indexesUsed = async (
    query: SelectQueryBuilder<ChargeEntity>,
    withoutIndexes: readonly string[] = [],
  ): Promise<string[]> => {
    const [sql, parameters] = query.getQueryAndParameters();
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('SET LOCAL enable_seqscan = off');
      for (const index of withoutIndexes) await runner.query(`DROP INDEX "billing"."${index}"`);
      const [{ 'QUERY PLAN': plan }] = await runner.query(
        `EXPLAIN (FORMAT JSON) ${sql}`,
        parameters,
      );
      return collectNodes(plan[0].Plan as PlanNode)
        .map((node) => node['Index Name'])
        .filter((name): name is string => name !== undefined);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  };

  const attemptsInDb = async (chargeId: string): Promise<number> => {
    const [row] = await dataSource.query<{ provider_creation_attempts: number }[]>(
      `SELECT provider_creation_attempts FROM billing.charges WHERE id = $1`,
      [chargeId],
    );
    return row?.provider_creation_attempts ?? -1;
  };

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmChargeRepository(
      dataSource.getRepository(ChargeEntity),
      new InMemoryOutboxPublisher(),
    );
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

  describe('creation lease (claimForProviderCreation)', () => {
    it('two simultaneous claims on one PENDING charge give exactly one owner', async () => {
      const t = await newTenant();
      const charge = await seed(t, (b) => b);
      const now = new Date();

      const claims = await Promise.all([
        repo.claimForProviderCreation(t.tenantId, charge.id, now),
        repo.claimForProviderCreation(t.tenantId, charge.id, now),
      ]);

      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(await attemptsInDb(charge.id)).toBe(1);
    });

    it('a claim inside the lease is refused and one after it succeeds, counting each attempt', async () => {
      const t = await newTenant();
      const charge = await seed(t, (b) => b);
      const t0 = new Date('2026-03-02T12:00:00Z');
      const claim = (at: Date): Promise<boolean> =>
        repo.claimForProviderCreation(t.tenantId, charge.id, at);

      const first = await claim(t0);
      const inside = await claim(
        new Date(t0.getTime() + (PROVIDER_CREATION_LEASE_MINUTES - 1) * MINUTE),
      );
      const after = await claim(
        new Date(t0.getTime() + (PROVIDER_CREATION_LEASE_MINUTES + 1) * MINUTE),
      );

      expect([first, inside, after]).toEqual([true, false, true]);
      expect(await attemptsInDb(charge.id)).toBe(2);
    });

    it('refuses a charge the provider already created', async () => {
      const t = await newTenant();
      const charge = await seed(t, (b) => b.withProviderReady('ASAAS', 'pay_1'));

      expect(await repo.claimForProviderCreation(t.tenantId, charge.id, new Date())).toBe(false);
      expect(await attemptsInDb(charge.id)).toBe(0);
    });

    it.each(['CANCELED', 'PAID'])(
      'refuses a %s charge: a closed charge never gets a provider bill',
      async (status) => {
        const t = await newTenant();
        const charge = await seed(t, (b) => b.withStatus(status as 'CANCELED' | 'PAID'));

        expect(await repo.claimForProviderCreation(t.tenantId, charge.id, new Date())).toBe(false);
        expect(await attemptsInDb(charge.id)).toBe(0);
      },
    );

    it('the creation retry does not list a closed charge', async () => {
      const t = await newTenant();
      const cancelled = await seed(t, (b) => b.withStatus('CANCELED'));
      const open = await seed(t, (b) => b.withPeriod('2026-06-01', '2026-06-30'));

      const ids = (await repo.listPendingCreationForJob(new Date(), 100)).map((r) => r.id);

      expect(ids).toContain(open.id);
      expect(ids).not.toContain(cancelled.id);
    });

    it('refuses another tenant’s charge', async () => {
      const owner = await newTenant();
      const other = await newTenant();
      const charge = await seed(owner, (b) => b);

      expect(await repo.claimForProviderCreation(other.tenantId, charge.id, new Date())).toBe(
        false,
      );
    });

    it('a stale aggregate saved after a claim does not clobber the claim’s increment', async () => {
      const t = await newTenant();
      const created = await seed(t, (b) => b);
      const stale = await repo.findById(t.tenantId, created.id);
      await repo.claimForProviderCreation(t.tenantId, created.id, new Date());

      stale?.markOverdue();
      await repo.save(stale as Charge);

      expect(await attemptsInDb(created.id)).toBe(1);
      expect((await repo.findById(t.tenantId, created.id))?.providerCreationAttempts).toBe(1);
    });
  });

  describe('tenant isolation', () => {
    it('a tenant-scoped finder never returns another tenant’s charge', async () => {
      const owner = await newTenant();
      const other = await newTenant();
      const charge = await seed(owner, (b) => b.withProviderReady('ASAAS', 'pay_iso'));

      expect(await repo.findById(other.tenantId, charge.id)).toBeNull();
      expect(await repo.findByProviderChargeId(other.tenantId, 'ASAAS', 'pay_iso')).toBeNull();
      expect(await repo.findOpenByTenant(other.tenantId)).toEqual([]);
      expect(await repo.listByTenantPage(other.tenantId, { limit: 10, offset: 0 })).toEqual({
        items: [],
        total: 0,
      });
      expect((await repo.findById(owner.tenantId, charge.id))?.id).toBe(charge.id);
      expect((await repo.findByProviderChargeId(owner.tenantId, 'ASAAS', 'pay_iso'))?.id).toBe(
        charge.id,
      );
    });

    it('the composite FK (tenant_id, charge_id) rejects a line pointing at another tenant’s charge', async () => {
      const owner = await newTenant();
      const other = await newTenant();
      const charge = await seed(owner, (b) => b);
      const line = new ChargeLineEntityBuilder()
        .withTenantId(other.tenantId)
        .withChargeId(charge.id)
        .build();

      await expect(dataSource.getRepository(ChargeLineEntity).insert(line)).rejects.toThrow(
        QueryFailedError,
      );
    });
  });

  describe('pagination and job selectors', () => {
    it('pages a tenant’s history newest due date first, id as tiebreak, with the unpaged total', async () => {
      const t = await newTenant();
      const dues = ['2026-01-10', '2026-03-10', '2026-02-10', '2026-03-10'];
      const charges: Charge[] = [];
      for (const [index, due] of dues.entries()) {
        charges.push(
          await seed(t, (b) =>
            b.withPeriod(`2026-0${index + 1}-01`, `2026-0${index + 1}-28`).withDueDate(due),
          ),
        );
      }

      const first = await repo.listByTenantPage(t.tenantId, { limit: 2, offset: 0 });
      const second = await repo.listByTenantPage(t.tenantId, { limit: 2, offset: 2 });

      expect(first.total).toBe(4);
      expect(first.items.map((c) => c.dueDate.value)).toEqual(['2026-03-10', '2026-03-10']);
      const tied = charges.filter((c) => c.dueDate.value === '2026-03-10').map((c) => c.id);
      expect(first.items.map((c) => c.id)).toEqual([...tied].sort().reverse());
      expect(second.items.map((c) => c.dueDate.value)).toEqual(['2026-02-10', '2026-01-10']);
    });

    it('the selectors return only the rows of their own filter', async () => {
      const t = await newTenant();
      const now = new Date('2026-03-02T12:00:00Z');
      const pending = await seed(t, (b) =>
        b.withPeriod('2026-03-01', '2026-03-31').withDueDate('2026-03-05'),
      );
      const overdue = await seed(t, (b) =>
        b.withPeriod('2026-04-01', '2026-04-30').withDueDate('2026-03-20').withStatus('OVERDUE'),
      );
      const cancelled = await seed(t, (b) =>
        b
          .withPeriod('2026-05-01', '2026-05-31')
          .withStatus('CANCELED')
          .withProviderCancelPending()
          .withProviderReady('ASAAS', 'pay_cancel'),
      );
      const ids = (refs: { id: string }[]): string[] =>
        refs.filter((r) => [pending.id, overdue.id, cancelled.id].includes(r.id)).map((r) => r.id);

      expect(ids(await repo.listOpenForJob(100)).sort()).toEqual([pending.id, overdue.id].sort());
      expect(ids(await repo.listOpenDueForJob('2026-03-10', 100))).toEqual([pending.id]);
      expect(ids(await repo.listPendingCreationForJob(now, 100))).toEqual(
        [pending.id, overdue.id].sort(),
      );
      expect(ids(await repo.listProviderCancelPendingForJob(100))).toEqual([cancelled.id]);
    });

    it('the creation retry pages on from the last row it was given, never-attempted charges first', async () => {
      const t = await newTenant();
      const a = await seed(t, (b) => b.withPeriod('2026-06-01', '2026-06-30'));
      const b = await seed(t, (builder) => builder.withPeriod('2026-07-01', '2026-07-31'));
      const mineRows = <T extends { id: string }>(rows: T[]): T[] =>
        rows.filter((r) => [a.id, b.id].includes(r.id));
      const now = new Date();

      const all = mineRows(await repo.listPendingCreationForJob(now, 1000));
      expect(all.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
      expect(all.every((r) => r.lastAttemptAt === null)).toBe(true);

      const afterFirst = mineRows(await repo.listPendingCreationForJob(now, 1000, all[0]));
      expect(afterFirst.map((r) => r.id)).toEqual([all[1].id]);
      expect(mineRows(await repo.listPendingCreationForJob(now, 1000, all[1]))).toEqual([]);
    });

    it('the creation retry skips a charge whose lease is still held', async () => {
      const t = await newTenant();
      const charge = await seed(t, (b) => b);
      const t0 = new Date('2026-03-02T12:00:00Z');
      await repo.claimForProviderCreation(t.tenantId, charge.id, t0);
      const mine = (refs: { id: string }[]): string[] =>
        refs.filter((r) => r.id === charge.id).map((r) => r.id);

      expect(
        mine(await repo.listPendingCreationForJob(new Date(t0.getTime() + MINUTE), 100)),
      ).toEqual([]);
      expect(
        mine(await repo.listPendingCreationForJob(new Date(t0.getTime() + 11 * MINUTE), 100)),
      ).toEqual([charge.id]);
    });

    it('the reconcile selectors page by keyset, never repeating a row and never skipping one', async () => {
      const t = await newTenant();
      const open = await Promise.all(
        ['2026-03-01', '2026-04-01', '2026-05-01'].map((start, index) =>
          seed(t, (b) =>
            b
              .withPeriod(start, `2026-0${index + 3}-28`)
              .withDueDate(`2026-0${index + 3}-05`)
              .withStatus(index === 1 ? 'OVERDUE' : 'PENDING'),
          ),
        ),
      );
      const mine = (refs: { id: string }[]): string[] =>
        refs.filter((r) => open.some((c) => c.id === r.id)).map((r) => r.id);
      const pageThrough = async (): Promise<string[]> => {
        const seen: string[] = [];
        let after: Awaited<ReturnType<typeof repo.listOpenForJob>>[number] | undefined;
        for (;;) {
          const page = await repo.listOpenForJob(1000, after);
          const rows = page.filter((r) => !seen.includes(r.id));
          if (page.length === 0 || rows.length === 0) return seen;
          seen.push(...rows.map((r) => r.id));
          after = page.at(-1);
        }
      };
      const first = await repo.listOpenForJob(1000);
      const second = await repo.listOpenForJob(
        1000,
        first.find((r) => r.id === open[0].id),
      );

      expect(mine(first)).toEqual(open.map((c) => c.id));
      expect(mine(second)).toEqual([open[1].id, open[2].id]);
      expect((await pageThrough()).filter((id) => open.some((c) => c.id === id))).toEqual(
        open.map((c) => c.id),
      );
      expect(first.find((r) => r.id === open[0].id)?.dueDate).toBe('2026-03-05');
    });

    it('lists the open charges due inside a date window, by due date, and pages on from the last row (the dunning reminders)', async () => {
      const t = await newTenant();
      // Each charge needs its own period start (the period's unique index).
      let month = 0;
      const dueIn = async (dueDate: string, status: 'PENDING' | 'OVERDUE' | 'PAID' = 'PENDING') => {
        month += 1;
        const mm = String(month).padStart(2, '0');
        return seed(t, (b) => {
          const built = b.withPeriod(`2027-${mm}-01`, `2027-${mm}-28`).withDueDate(dueDate);
          return status === 'PAID'
            ? built.withStatus('PAID').withPaid('CARD', new Date('2027-01-01T00:00:00Z'))
            : built.withStatus(status);
        });
      };
      const before = await dueIn('2027-03-01');
      const first = await dueIn('2027-04-03');
      const second = await dueIn('2027-05-10', 'OVERDUE');
      const last = await dueIn('2027-06-20');
      const afterWindow = await dueIn('2027-07-15');
      const paidInside = await dueIn('2027-05-05', 'PAID');
      // Every seeded charge is in the filter, so a selector that ignored the status or the upper
      // bound would return the paid one or the late one and fail the assertion below.
      const own = [before, first, second, last, afterWindow, paidInside].map((c) => c.id);
      const mine = (refs: { id: string }[]): string[] =>
        refs.filter((r) => own.includes(r.id)).map((r) => r.id);

      const window = await repo.listOpenDueBetweenForJob('2027-04-03', '2027-06-20', 1000);
      const after = await repo.listOpenDueBetweenForJob(
        '2027-04-03',
        '2027-06-20',
        1000,
        window.find((r) => r.id === first.id),
      );

      // Both ends are inclusive, a paid charge and one outside the window never match.
      expect(mine(window)).toEqual([first.id, second.id, last.id]);
      expect(mine(after)).toEqual([second.id, last.id]);
      expect(window.find((r) => r.id === first.id)?.dueDate).toBe('2027-04-03');
      expect(await repo.listOpenDueBetweenForJob('2027-04-03', '2027-06-20', 1, window[0])).toEqual(
        [window[1]],
      );
    });

    it('lists the open recovery charges, the open charges of ending trials and the recently paid ones', async () => {
      const recoveryTenant = await newTenant();
      const trialTenant = await newTenant();
      const activeTenant = await newTenant();
      const trialEnds = new Date('2026-03-10T12:00:00Z');
      await dataSource
        .getRepository(SubscriptionEntity)
        .update({ tenantId: trialTenant.tenantId }, { status: 'TRIALING', trialEndsAt: trialEnds });
      const recovery = await seed(recoveryTenant, (b) =>
        b.withPeriod('2026-03-01', '2026-03-31').asRecovery().withDueDate('2026-03-08'),
      );
      const trialCharge = await seed(trialTenant, (b) => b.withDueDate('2026-03-10'));
      const activeCharge = await seed(activeTenant, (b) => b.withDueDate('2026-03-10'));
      const paidAt = new Date('2026-03-01T12:00:00Z');
      const paid = await seed(activeTenant, (b) =>
        b.withPeriod('2026-02-01', '2026-02-28').withStatus('PAID').withPaid('CARD', paidAt),
      );
      const oldPaid = await seed(activeTenant, (b) =>
        b
          .withPeriod('2025-12-01', '2025-12-31')
          .withStatus('PAID')
          .withPaid('CARD', new Date('2025-12-05T12:00:00Z')),
      );
      const mine = (refs: { id: string }[]): string[] => {
        const own = [recovery, trialCharge, activeCharge, paid, oldPaid].map((c) => c.id);
        return refs.filter((r) => own.includes(r.id)).map((r) => r.id);
      };

      expect(mine(await repo.listOpenRecoveryForJob(100_000))).toEqual([recovery.id]);
      // The active tenant's open charge is no trial's: only the trialing subscription's is listed,
      // and only while the trial ends within the window.
      expect(
        mine(await repo.listOpenTrialChargesForJob(new Date('2026-03-20T00:00:00Z'), 100_000)),
      ).toEqual([trialCharge.id]);
      expect(
        mine(await repo.listOpenTrialChargesForJob(new Date('2026-03-01T00:00:00Z'), 100_000)),
      ).toEqual([]);
      const recent = await repo.listRecentlyPaidForJob(new Date('2026-01-26T00:00:00Z'), 100_000);
      expect(mine(recent)).toEqual([paid.id]);
      expect(recent.find((r) => r.id === paid.id)?.paidAt).toEqual(paidAt);
    });

    it('serves the page and every job from its own index (EXPLAIN asserted)', async () => {
      const t = await newTenant();
      await seed(t, (b) => b);
      const manager: EntityManager = dataSource.manager;
      const chargeRepo = dataSource.getRepository(ChargeEntity);

      expect(
        await indexesUsed(buildPageQuery(manager, t.tenantId, { limit: 10, offset: 0 })),
      ).toContain('IDX_billing_charges_history');
      expect(
        await indexesUsed(buildPendingCreationQuery(chargeRepo, new Date(), 10), [
          'IDX_billing_charges_open',
        ]),
      ).toContain('IDX_billing_charges_creation_retry');
      expect(await indexesUsed(buildOpenDueQuery(chargeRepo, '2026-12-31', 10))).toContain(
        'IDX_billing_charges_open',
      );
      expect(await indexesUsed(buildOpenQuery(chargeRepo, 10))).toContain(
        'IDX_billing_charges_open',
      );
      expect(await indexesUsed(buildProviderCancelPendingQuery(chargeRepo, 10))).toContain(
        'IDX_billing_charges_cancel_pending',
      );
    });

    it('serves each reconcile selector from its own index (EXPLAIN asserted)', async () => {
      const t = await newTenant();
      await seed(t, (b) => b);
      const chargeRepo = dataSource.getRepository(ChargeEntity);
      const after = { tenantId: t.tenantId, id: uuidv7(), dueDate: '2026-01-01' };

      expect(await indexesUsed(buildOpenDueQuery(chargeRepo, '2026-12-31', 10, after))).toContain(
        'IDX_billing_charges_open',
      );
      expect(await indexesUsed(buildOpenQuery(chargeRepo, 10, after))).toContain(
        'IDX_billing_charges_open',
      );
      // The dunning reminders' due-date window (M26-S09), same standalone index.
      expect(
        await indexesUsed(
          buildOpenDueBetweenQuery(chargeRepo, '2026-12-01', '2026-12-31', 10, after),
        ),
      ).toContain('IDX_billing_charges_open');
      expect(
        await indexesUsed(
          buildOpenRecoveryQuery(chargeRepo, 10, {
            tenantId: t.tenantId,
            id: uuidv7(),
            subscriptionId: t.subscriptionId,
          }),
          ['IDX_billing_charges_open'],
        ),
      ).toContain('UQ_billing_charges_open_recovery');
      expect(
        await indexesUsed(buildRecentlyPaidQuery(chargeRepo, new Date(0), 10), [
          'IDX_billing_charges_open',
        ]),
      ).toContain('IDX_billing_charges_paid_recent');
      // The trial index narrows the subscriptions, the charge's own unique index finds each one's
      // open charge: neither side is a scan of the whole table.
      const trialPlan = await indexesUsed(
        buildOpenTrialChargesQuery(chargeRepo, new Date('2030-01-01T00:00:00Z'), 10, after),
        ['IDX_billing_charges_open', 'IDX_billing_charges_history'],
      );
      expect(trialPlan).toContain('IDX_billing_subscriptions_trial_ends_at');
      expect(trialPlan).toContain('UQ_billing_charges_period');
    });
  });
});
