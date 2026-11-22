import { DataSource, SelectQueryBuilder } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { SubscriptionEntityBuilder } from '../../../../test/builders/billing';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { createTestDataSource } from '../../../../test/test-datasource';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { TypeOrmSubscriptionRepository } from './typeorm-subscription.repository';
import {
  buildCancelDueQuery,
  buildGraceExpiredQuery,
  buildTrialEndedQuery,
  buildTrialEndingQuery,
} from './typeorm-subscription.sweep-queries';

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

const collectNodes = (node: PlanNode): PlanNode[] => [
  node,
  ...(node.Plans ?? []).flatMap(collectNodes),
];

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-03-10T15:00:00Z');
const ago = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

describe('TypeOrmSubscriptionRepository status-sweep selectors (integration, UC-115)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmSubscriptionRepository;
  const tenants: string[] = [];

  const seed = async (
    configure: (builder: SubscriptionEntityBuilder) => SubscriptionEntityBuilder,
  ): Promise<string> => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    const builder = configure(new SubscriptionEntityBuilder().withTenantId(tenantId));
    await dataSource.getRepository(SubscriptionEntity).insert(builder.build());
    return tenantId;
  };

  // Plans the exact SQL the repository runs, with sequential scans disabled for the transaction so
  // a near-empty test table cannot make the planner's choice meaningless. Even then two partial
  // indexes that can both serve a query tie on the statistics of an empty table, so a caller names
  // the competitors to take away: the plan is made in a transaction that is rolled back, and
  // Postgres DDL is transactional. The query is then served by the named index or by no index at all.
  const nodesOf = async (
    query: SelectQueryBuilder<SubscriptionEntity>,
    withoutIndexes: readonly string[],
  ): Promise<PlanNode[]> => {
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
      return collectNodes(plan[0].Plan as PlanNode);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  };
  // A bitmap scan names its index on a child node that carries no relation, so every node counts.
  const indexesUsed = async (
    query: SelectQueryBuilder<SubscriptionEntity>,
    withoutIndexes: readonly string[] = [],
  ): Promise<{ indexes: string[]; seqScan: boolean }> => {
    const nodes = await nodesOf(query, withoutIndexes);
    return {
      indexes: nodes.flatMap((node) => (node['Index Name'] ? [node['Index Name']] : [])),
      seqScan: nodes.some((node) => node['Node Type'] === 'Seq Scan'),
    };
  };

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmSubscriptionRepository(
      dataSource.getRepository(SubscriptionEntity),
      new InMemoryOutboxPublisher(),
    );
  });

  afterEach(async () => {
    if (tenants.length > 0) {
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

  // Other suites' rows share the table, so every assertion looks at this spec's own tenants only.
  const mine = (refs: { tenantId: string }[]): string[] =>
    refs.map((ref) => ref.tenantId).filter((id) => tenants.includes(id));

  describe('findTrialEndedForJob (rules 2 and 5)', () => {
    it('selects TRIALING, non-exempt subscriptions whose trial has ended, oldest end first', async () => {
      const later = await seed((b) => b.withStatus('TRIALING').withTrialEndsAt(ago(1)));
      const sooner = await seed((b) => b.withStatus('TRIALING').withTrialEndsAt(ago(3)));
      await seed((b) => b.withStatus('TRIALING').withTrialEndsAt(new Date(NOW.getTime() + DAY_MS)));
      await seed((b) => b.withStatus('TRIALING').withTrialEndsAt(ago(3)).withExempt(true));
      await seed((b) => b.withStatus('ACTIVE').withTrialEndsAt(ago(3)));

      const refs = await repo.findTrialEndedForJob(NOW, 1000);

      expect(mine(refs)).toEqual([sooner, later]);
      expect(refs.find((ref) => ref.tenantId === sooner)?.dueAt).toEqual(ago(3));
    });

    it('pages on from the row it is given, past subscriptions that stay selected', async () => {
      const first = await seed((b) => b.withStatus('TRIALING').withTrialEndsAt(ago(5)));
      const second = await seed((b) => b.withStatus('TRIALING').withTrialEndsAt(ago(4)));
      const third = await seed((b) => b.withStatus('TRIALING').withTrialEndsAt(ago(2)));

      const all = await repo.findTrialEndedForJob(NOW, 1000);
      const start = all.findIndex((ref) => ref.tenantId === first);
      const after = await repo.findTrialEndedForJob(NOW, 1000, all[start]);

      expect(mine(after)).toEqual([second, third]);
      expect(await repo.findTrialEndedForJob(NOW, 1, all[start])).toEqual([all[start + 1]]);
    });

    it('is served by the standalone partial index on trial_ends_at, not a sequential scan', async () => {
      await seed((b) => b.withStatus('TRIALING').withTrialEndsAt(ago(2)));

      const used = await indexesUsed(
        buildTrialEndedQuery(dataSource.getRepository(SubscriptionEntity), NOW, 500),
      );

      expect(used.indexes).toContain('IDX_billing_subscriptions_trial_ends_at');
      expect(used.seqScan).toBe(false);
    });
  });

  describe('findTrialEndingForJob (the dunning reminders, UC-139)', () => {
    const from = ago(2);
    const to = new Date(NOW.getTime() + 11 * DAY_MS);

    it('selects TRIALING, non-exempt subscriptions whose trial ends inside the window, soonest first', async () => {
      const soon = await seed((b) =>
        b.withStatus('TRIALING').withTrialEndsAt(new Date(NOW.getTime() + 2 * DAY_MS)),
      );
      const justEnded = await seed((b) => b.withStatus('TRIALING').withTrialEndsAt(ago(1)));
      const farthest = await seed((b) =>
        b.withStatus('TRIALING').withTrialEndsAt(new Date(NOW.getTime() + 10 * DAY_MS)),
      );
      await seed((b) => b.withStatus('TRIALING').withTrialEndsAt(ago(5)));
      await seed((b) =>
        b.withStatus('TRIALING').withTrialEndsAt(new Date(NOW.getTime() + 20 * DAY_MS)),
      );
      await seed((b) =>
        b
          .withStatus('TRIALING')
          .withTrialEndsAt(new Date(NOW.getTime() + DAY_MS))
          .withExempt(true),
      );
      await seed((b) => b.withStatus('ACTIVE').withTrialEndsAt(new Date(NOW.getTime() + DAY_MS)));

      const refs = await repo.findTrialEndingForJob(from, to, 1000);

      expect(mine(refs)).toEqual([justEnded, soon, farthest]);
    });

    it('includes both ends of the window and pages on from the row it is given', async () => {
      const atFrom = await seed((b) => b.withStatus('TRIALING').withTrialEndsAt(from));
      const middle = await seed((b) => b.withStatus('TRIALING').withTrialEndsAt(NOW));
      const atTo = await seed((b) => b.withStatus('TRIALING').withTrialEndsAt(to));

      const all = await repo.findTrialEndingForJob(from, to, 1000);
      const start = all.findIndex((ref) => ref.tenantId === atFrom);

      expect(mine(all)).toEqual([atFrom, middle, atTo]);
      expect(mine(await repo.findTrialEndingForJob(from, to, 1000, all[start]))).toEqual([
        middle,
        atTo,
      ]);
      expect(await repo.findTrialEndingForJob(from, to, 1, all[start])).toEqual([all[start + 1]]);
    });

    it('is served by the standalone partial index on trial_ends_at, not a sequential scan', async () => {
      await seed((b) => b.withStatus('TRIALING').withTrialEndsAt(NOW));

      const used = await indexesUsed(
        buildTrialEndingQuery(dataSource.getRepository(SubscriptionEntity), from, to, 500),
      );

      expect(used.indexes).toContain('IDX_billing_subscriptions_trial_ends_at');
      expect(used.seqScan).toBe(false);
    });
  });

  describe('findGraceExpiredForJob (rule 3)', () => {
    it('selects PAST_DUE subscriptions past 14 days, and only past a later operator grace when one is set', async () => {
      const plain = await seed((b) => b.withStatus('PAST_DUE').withPastDueSince(ago(15)));
      const olderGrace = await seed((b) =>
        b.withStatus('PAST_DUE').withPastDueSince(ago(20)).withGraceUntil(ago(1)),
      );
      await seed((b) => b.withStatus('PAST_DUE').withPastDueSince(ago(13)));
      await seed((b) =>
        b
          .withStatus('PAST_DUE')
          .withPastDueSince(ago(20))
          .withGraceUntil(new Date(NOW.getTime() + DAY_MS)),
      );
      await seed((b) => b.withStatus('PAST_DUE').withPastDueSince(ago(20)).withExempt(true));
      await seed((b) => b.withStatus('ACTIVE').withPastDueSince(ago(20)));

      const refs = await repo.findGraceExpiredForJob(NOW, 1000);

      expect(mine(refs)).toEqual([olderGrace, plain]);
    });

    it('pages on from the row it is given', async () => {
      const first = await seed((b) => b.withStatus('PAST_DUE').withPastDueSince(ago(30)));
      const second = await seed((b) => b.withStatus('PAST_DUE').withPastDueSince(ago(20)));

      const all = await repo.findGraceExpiredForJob(NOW, 1000);
      const start = all.findIndex((ref) => ref.tenantId === first);

      expect(mine(await repo.findGraceExpiredForJob(NOW, 1000, all[start]))).toEqual([second]);
    });

    it('is served by the (status, past_due_since) index, not a sequential scan', async () => {
      await seed((b) => b.withStatus('PAST_DUE').withPastDueSince(ago(15)));

      const used = await indexesUsed(
        buildGraceExpiredQuery(dataSource.getRepository(SubscriptionEntity), NOW, 500),
      );

      expect(used.indexes).toContain('IDX_billing_subscriptions_status_past_due_since');
      expect(used.seqScan).toBe(false);
    });
  });

  describe('findCancelDueForJob (rule 4)', () => {
    it('selects TRIALING, ACTIVE and PAST_DUE subscriptions whose cancelAt is reached, never a suspended one', async () => {
      const active = await seed((b) => b.withStatus('ACTIVE').withCancelAt(ago(2)));
      const pastDue = await seed((b) => b.withStatus('PAST_DUE').withCancelAt(ago(1)));
      const trial = await seed((b) => b.withStatus('TRIALING').withCancelAt(ago(3)));
      await seed((b) => b.withStatus('ACTIVE').withCancelAt(new Date(NOW.getTime() + DAY_MS)));
      await seed((b) => b.withStatus('ACTIVE').withCancelAt(null));
      await seed((b) => b.withSuspension('NON_PAYMENT', ago(5)).withCancelAt(ago(2)));
      await seed((b) => b.withStatus('ACTIVE').withCancelAt(ago(2)).withExempt(true));

      const refs = await repo.findCancelDueForJob(NOW, 1000);

      expect(mine(refs)).toEqual([trial, active, pastDue]);
    });

    it('pages on from the row it is given', async () => {
      const first = await seed((b) => b.withStatus('ACTIVE').withCancelAt(ago(5)));
      const second = await seed((b) => b.withStatus('ACTIVE').withCancelAt(ago(4)));

      const all = await repo.findCancelDueForJob(NOW, 1000);
      const start = all.findIndex((ref) => ref.tenantId === first);

      expect(mine(await repo.findCancelDueForJob(NOW, 1000, all[start]))).toEqual([second]);
    });

    it('is served by the partial index on cancel_at, not a sequential scan', async () => {
      await seed((b) => b.withStatus('ACTIVE').withCancelAt(ago(2)));

      const used = await indexesUsed(
        buildCancelDueQuery(dataSource.getRepository(SubscriptionEntity), NOW, 500),
        // Its status predicate (TRIALING / ACTIVE / PAST_DUE, not exempt) also lets the planner use
        // the reminders index or a seek on (status, past_due_since); on an empty table they tie.
        ['IDX_billing_subscriptions_reminders', 'IDX_billing_subscriptions_status_past_due_since'],
      );

      expect(used.indexes).toContain('IDX_billing_subscriptions_cancel_at');
      expect(used.seqScan).toBe(false);
    });
  });

  it('lists the distinct merchant profile keys in use, once each and in key order (UC-116)', async () => {
    const base = uuidv7().slice(-8);
    await seed((b) => b.withMerchantProfileKey(`ZZ_${base}_B`));
    await seed((b) => b.withMerchantProfileKey(`ZZ_${base}_A`));
    await seed((b) => b.withMerchantProfileKey(`ZZ_${base}_B`));

    const keys = (await repo.listMerchantProfileKeys()).filter((key) => key.includes(base));

    expect(keys).toEqual([`ZZ_${base}_A`, `ZZ_${base}_B`]);
  });
});
