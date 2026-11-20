import { DataSource, SelectQueryBuilder } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ChargeBuilder, SubscriptionEntityBuilder } from '../../../../test/builders/billing';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { createTestDataSource } from '../../../../test/test-datasource';
import type { Charge } from '../../domain/charge.aggregate';
import { ChargeEntity } from '../entities/charge.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { buildOverdueCandidatesQuery } from './typeorm-charge.job-queries';
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

describe('TypeOrmChargeRepository status-sweep reads (integration, UC-115)', () => {
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

  // See typeorm-charge.repository.queries.integration.spec.ts: the plan is made in a rolled-back
  // transaction with sequential scans off, and a competing partial index is taken away by name.
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

  describe('listOverdueCandidatesForJob (rule 1)', () => {
    const mine = <T extends { id: string }>(refs: T[], ids: string[]): T[] =>
      refs.filter((ref) => ids.includes(ref.id));

    it('selects PENDING charges with a payment link whose due date is on or before the date, oldest first', async () => {
      const t = await newTenant();
      const newer = await seed(t, (b) =>
        b
          .withPeriod('2026-02-10', '2026-03-09')
          .withDueDate('2026-03-09')
          .withProviderReady('ASAAS', 'pay_n'),
      );
      const older = await seed(t, (b) =>
        b
          .withPeriod('2026-01-10', '2026-02-09')
          .withDueDate('2026-02-10')
          .withProviderReady('ASAAS', 'pay_o'),
      );

      const refs = await repo.listOverdueCandidatesForJob('2026-03-10', 1000);

      expect(mine(refs, [newer.id, older.id])).toEqual([
        { tenantId: t.tenantId, id: older.id, dueDate: '2026-02-10' },
        { tenantId: t.tenantId, id: newer.id, dueDate: '2026-03-09' },
      ]);
    });

    it('never selects a charge with no payment link, one not PENDING, or one due after the date', async () => {
      const t = await newTenant();
      const held = await seed(t, (b) =>
        b.withPeriod('2026-01-10', '2026-02-09').withDueDate('2026-02-10'),
      );
      const overdue = await seed(t, (b) =>
        b
          .withPeriod('2026-02-10', '2026-03-09')
          .withDueDate('2026-03-01')
          .withStatus('OVERDUE')
          .withProviderReady('ASAAS', 'pay_od'),
      );
      const future = await seed(t, (b) =>
        b
          .withPeriod('2026-03-10', '2026-04-09')
          .withDueDate('2026-03-11')
          .withProviderReady('ASAAS', 'pay_f'),
      );

      const refs = await repo.listOverdueCandidatesForJob('2026-03-10', 1000);

      expect(mine(refs, [held.id, overdue.id, future.id])).toEqual([]);
    });

    it('pages on from the row it is given', async () => {
      const t = await newTenant();
      const first = await seed(t, (b) =>
        b
          .withPeriod('2026-01-10', '2026-02-09')
          .withDueDate('2026-02-10')
          .withProviderReady('ASAAS', 'pay_1'),
      );
      const second = await seed(t, (b) =>
        b
          .withPeriod('2026-02-10', '2026-03-09')
          .withDueDate('2026-03-09')
          .withProviderReady('ASAAS', 'pay_2'),
      );

      const all = await repo.listOverdueCandidatesForJob('2026-03-10', 1000);
      const start = all.findIndex((ref) => ref.id === first.id);

      expect(
        mine(await repo.listOverdueCandidatesForJob('2026-03-10', 1000, all[start]), [second.id]),
      ).toHaveLength(1);
      expect(await repo.listOverdueCandidatesForJob('2026-03-10', 1, all[start])).toEqual([
        all[start + 1],
      ]);
    });

    it('is served by IDX_billing_charges_open, not a sequential scan', async () => {
      const t = await newTenant();
      await seed(t, (b) => b.withDueDate('2026-03-01').withProviderReady('ASAAS', 'pay_x'));

      const used = await indexesUsed(
        buildOverdueCandidatesQuery(dataSource.getRepository(ChargeEntity), '2026-03-10', 10),
        // Both partial indexes are (status, due_date); a near-empty table ties them.
        ['IDX_billing_charges_cancel_pending'],
      );

      expect(used).toContain('IDX_billing_charges_open');
    });
  });

  describe('findFirstPeriodCharge', () => {
    it('answers the earliest period that is not cancelled, never a recovery charge or another tenant’s', async () => {
      const t = await newTenant();
      const other = await newTenant();
      await seed(t, (b) => b.withPeriod('2026-01-10', '2026-02-09').withStatus('CANCELED'));
      const first = await seed(t, (b) => b.withPeriod('2026-02-10', '2026-03-09'));
      await seed(t, (b) => b.withPeriod('2026-03-10', '2026-04-09'));
      await seed(t, (b) => b.asRecovery());
      await seed(other, (b) => b.withPeriod('2025-12-10', '2026-01-09'));

      const found = await repo.findFirstPeriodCharge(t.tenantId, t.subscriptionId);

      expect(found?.id).toBe(first.id);
      expect(found?.lines).toHaveLength(1);
    });

    it('answers null when the subscription never had one', async () => {
      const t = await newTenant();
      await seed(t, (b) => b.asRecovery());

      await expect(repo.findFirstPeriodCharge(t.tenantId, t.subscriptionId)).resolves.toBeNull();
    });
  });
});
