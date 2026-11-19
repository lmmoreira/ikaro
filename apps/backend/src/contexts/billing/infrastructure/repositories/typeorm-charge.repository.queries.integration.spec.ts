import { DataSource, EntityManager, QueryFailedError, SelectQueryBuilder } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  ChargeBuilder,
  ChargeLineEntityBuilder,
  SubscriptionEntityBuilder,
} from '../../../../test/builders/billing';
import { createTestDataSource } from '../../../../test/test-datasource';
import { PROVIDER_CREATION_LEASE_MINUTES } from '../../domain/billing-constants';
import { Charge } from '../../domain/charge.aggregate';
import { ChargeEntity } from '../entities/charge.entity';
import { ChargeLineEntity } from '../entities/charge-line.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
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
  // a near-empty test table cannot make the planner's choice meaningless.
  const indexesUsed = async (query: SelectQueryBuilder<ChargeEntity>): Promise<string[]> => {
    const [sql, parameters] = query.getQueryAndParameters();
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('SET LOCAL enable_seqscan = off');
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
    repo = new TypeOrmChargeRepository(dataSource.getRepository(ChargeEntity));
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
      expect(ids(await repo.listPendingCreationForJob(now, 100))).toEqual([pending.id, overdue.id]);
      expect(ids(await repo.listProviderCancelPendingForJob(100))).toEqual([cancelled.id]);
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

    it('serves the page and every job from its own index (EXPLAIN asserted)', async () => {
      const t = await newTenant();
      await seed(t, (b) => b);
      const manager: EntityManager = dataSource.manager;

      expect(
        await indexesUsed(repo.buildPageQuery(manager, t.tenantId, { limit: 10, offset: 0 })),
      ).toContain('IDX_billing_charges_history');
      expect(await indexesUsed(repo.buildPendingCreationQuery(new Date(), 10))).toContain(
        'IDX_billing_charges_creation_retry',
      );
      expect(await indexesUsed(repo.buildOpenDueQuery('2026-12-31', 10))).toContain(
        'IDX_billing_charges_open',
      );
      expect(await indexesUsed(repo.buildOpenQuery(10))).toContain('IDX_billing_charges_open');
      expect(await indexesUsed(repo.buildProviderCancelPendingQuery(10))).toContain(
        'IDX_billing_charges_cancel_pending',
      );
    });
  });
});
