import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { SubscriptionEntityBuilder } from '../../../../test/builders/billing';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { createTestDataSource } from '../../../../test/test-datasource';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { TypeOrmSubscriptionRepository } from './typeorm-subscription.repository';

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

function collectNodes(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(collectNodes)];
}

describe('TypeOrmSubscriptionRepository.findDueForIssueForJob (integration, UC-113)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmSubscriptionRepository;
  const tenants: string[] = [];

  const seed = async (
    status: string,
    nextDueDate: string | null,
    options: { exempt?: boolean } = {},
  ): Promise<string> => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    const builder = new SubscriptionEntityBuilder()
      .withTenantId(tenantId)
      .withNextDueDate(nextDueDate)
      .withExempt(options.exempt ?? false);
    if (status === 'SUSPENDED') builder.withSuspension('NON_PAYMENT', new Date());
    else builder.withStatus(status);
    await dataSource.getRepository(SubscriptionEntity).insert(builder.build());
    return tenantId;
  };

  // Plans the exact SQL the repository runs, with sequential scans disabled for the transaction so
  // a near-empty test table cannot make the planner's choice meaningless.
  const explain = async (dueOnOrBefore: string, limit: number): Promise<PlanNode[]> => {
    const [sql, parameters] = repo
      .buildDueForIssueQuery(dueOnOrBefore, limit)
      .getQueryAndParameters();
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('SET LOCAL enable_seqscan = off');
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

  // Other tests' rows share the table, so every assertion looks at this spec's own tenants only.
  const mine = (refs: { tenantId: string }[]): string[] =>
    refs.map((ref) => ref.tenantId).filter((id) => tenants.includes(id));

  it('selects TRIALING and ACTIVE subscriptions due on or before the date, soonest first', async () => {
    const later = await seed('ACTIVE', '2026-03-20');
    const sooner = await seed('TRIALING', '2026-03-12');
    await seed('ACTIVE', '2026-03-22');

    const ids = await repo.findDueForIssueForJob('2026-03-21', 1000);

    expect(mine(ids)).toEqual([sooner, later]);
  });

  it('never selects an exempt, PAST_DUE or SUSPENDED subscription, or one with no due date', async () => {
    await seed('ACTIVE', '2026-03-12', { exempt: true });
    await seed('PAST_DUE', '2026-03-12');
    await seed('SUSPENDED', '2026-03-12');
    await seed('ACTIVE', null);

    const ids = await repo.findDueForIssueForJob('2026-03-21', 1000);

    expect(mine(ids)).toEqual([]);
  });

  it('pages on from the row it is given, past subscriptions that stay due', async () => {
    const first = await seed('ACTIVE', '2026-03-01');
    const second = await seed('ACTIVE', '2026-03-02');
    const third = await seed('TRIALING', '2026-03-03');

    const all = await repo.findDueForIssueForJob('2026-03-21', 1000);
    const start = all.findIndex((ref) => ref.tenantId === first);
    const afterFirst = await repo.findDueForIssueForJob('2026-03-21', 1000, all[start]);

    expect(all[start].nextDueDate).toBe('2026-03-01');
    expect(mine(afterFirst)).toEqual([second, third]);
    const pageOfOne = await repo.findDueForIssueForJob('2026-03-21', 1, all[start]);
    expect(pageOfOne).toHaveLength(1);
    expect(pageOfOne[0].tenantId).toBe(all[start + 1].tenantId);
  });

  it('is capped at the limit', async () => {
    await seed('ACTIVE', '2026-03-01');
    await seed('ACTIVE', '2026-03-02');

    const ids = await repo.findDueForIssueForJob('2026-03-21', 1);

    expect(ids).toHaveLength(1);
  });

  it('is served by the standalone partial index on next_due_date, not a sequential scan', async () => {
    await seed('ACTIVE', '2026-03-12');

    const nodes = await explain('2026-03-21', 500);

    const scans = nodes.filter((node) => node['Relation Name'] === 'subscriptions');
    expect(scans.length).toBeGreaterThan(0);
    expect(scans.some((node) => node['Index Name'] === 'IDX_billing_subscriptions_issuing')).toBe(
      true,
    );
    expect(scans.some((node) => node['Node Type'] === 'Seq Scan')).toBe(false);
  });
});
