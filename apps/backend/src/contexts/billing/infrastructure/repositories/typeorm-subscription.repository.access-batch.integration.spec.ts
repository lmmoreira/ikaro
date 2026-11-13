import { DataSource, SelectQueryBuilder } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  SubscriptionEntityBuilder,
  SubscriptionItemEntityBuilder,
} from '../../../../test/builders/billing';
import { createTestDataSource } from '../../../../test/test-datasource';
import { SubscriptionItemEntity } from '../entities/subscription-item.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { TypeOrmSubscriptionRepository } from './typeorm-subscription.repository';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

function collectNodes(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(collectNodes)];
}

describe('TypeOrmSubscriptionRepository access batch reads (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmSubscriptionRepository;
  const tenants: string[] = [];
  const NOW = new Date();

  const newTenant = (): string => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    return tenantId;
  };

  // A subscription row plus its HOTSITE (and optionally one more) items, written straight to the
  // tables: this spec reads, it does not exercise the write path.
  const seed = async (
    tenantId: string,
    status: string,
    featureKeys: string[] = ['HOTSITE'],
  ): Promise<void> => {
    const subscription = new SubscriptionEntityBuilder().withTenantId(tenantId);
    if (status === 'SUSPENDED') {
      subscription.withSuspension('NON_PAYMENT', new Date(NOW.getTime() - 1000));
    } else {
      subscription.withStatus(status);
    }
    const entity = subscription.build();
    await dataSource.getRepository(SubscriptionEntity).insert(entity);
    for (const featureKey of featureKeys) {
      await dataSource
        .getRepository(SubscriptionItemEntity)
        .insert(
          new SubscriptionItemEntityBuilder()
            .withTenantId(tenantId)
            .withSubscriptionId(entity.id)
            .withFeatureKey(featureKey)
            .build(),
        );
    }
  };

  // Plans the exact SQL the repository runs, with sequential scans disabled for the transaction so
  // a near-empty test table cannot make the planner's choice meaningless.
  const explain = async (query: SelectQueryBuilder<SubscriptionEntity>): Promise<PlanNode[]> => {
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
    await dataSource.query(
      `DELETE FROM "billing"."subscription_items" WHERE "tenant_id" = ANY($1::uuid[])`,
      [tenants],
    );
    await dataSource.query(
      `DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = ANY($1::uuid[])`,
      [tenants],
    );
    tenants.length = 0;
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('listSuspendedTenantIds', () => {
    it('lists the suspended tenants and no other, as ids', async () => {
      const suspended = newTenant();
      const active = newTenant();
      const trialing = newTenant();
      await seed(suspended, 'SUSPENDED');
      await seed(active, 'ACTIVE');
      await seed(trialing, 'TRIALING');

      const ids = await repo.listSuspendedTenantIds();

      expect(ids).toContain(suspended);
      expect(ids).not.toContain(active);
      expect(ids).not.toContain(trialing);
    });

    it('is served by the partial index on suspended_at, not a sequential scan', async () => {
      await seed(newTenant(), 'SUSPENDED');

      const nodes = await explain(repo.buildSuspendedIdsQuery());

      const subscriptionScans = nodes.filter((node) => node['Relation Name'] === 'subscriptions');
      expect(subscriptionScans.length).toBeGreaterThan(0);
      expect(
        subscriptionScans.some(
          (node) => node['Index Name'] === 'IDX_billing_subscriptions_suspended_at',
        ),
      ).toBe(true);
      expect(subscriptionScans.some((node) => node['Node Type'] === 'Seq Scan')).toBe(false);
    });
  });

  describe('findTenantIdsNotEntitledTo', () => {
    it('lists an ACTIVE tenant without the item, and not one with it, a TRIALING one or a SUSPENDED one', async () => {
      const without = newTenant();
      const withItem = newTenant();
      const trialing = newTenant();
      const suspended = newTenant();
      await seed(without, 'ACTIVE', ['HOTSITE']);
      await seed(withItem, 'ACTIVE', ['HOTSITE', 'LEAD_FORM']);
      await seed(trialing, 'TRIALING', ['HOTSITE']);
      await seed(suspended, 'SUSPENDED', ['HOTSITE']);

      const ids = await repo.findTenantIdsNotEntitledTo('LEAD_FORM', NOW);

      expect(ids).toContain(without);
      expect(ids).not.toContain(withItem);
      expect(ids).not.toContain(trialing);
      expect(ids).not.toContain(suspended);
    });

    it('lists a PAST_DUE tenant without the item and treats an ended item as absent', async () => {
      const pastDue = newTenant();
      await seed(pastDue, 'PAST_DUE', ['HOTSITE']);
      const ended = newTenant();
      await seed(ended, 'ACTIVE', []);
      const endedSubscription = await dataSource
        .getRepository(SubscriptionEntity)
        .findOneByOrFail({ tenantId: ended });
      await dataSource.getRepository(SubscriptionItemEntity).insert(
        new SubscriptionItemEntityBuilder()
          .withTenantId(ended)
          .withSubscriptionId(endedSubscription.id)
          .withFeatureKey('LEAD_FORM')
          .withStartsAt(new Date(NOW.getTime() - 2 * 86_400_000))
          .withEndsAt(new Date(NOW.getTime() - 1000))
          .build(),
      );

      const ids = await repo.findTenantIdsNotEntitledTo('LEAD_FORM', NOW);

      expect(ids).toContain(pastDue);
      expect(ids).toContain(ended);
    });

    it('returns ids only: asking about one feature never exposes another tenant’s features', async () => {
      await seed(newTenant(), 'ACTIVE', ['HOTSITE', 'BOOKING']);

      const ids = await repo.findTenantIdsNotEntitledTo('LEAD_FORM', NOW);

      expect(ids.every((id) => typeof id === 'string')).toBe(true);
    });

    it('does not sequentially scan subscription_items (it probes the (tenant_id, subscription_id) index)', async () => {
      await seed(newTenant(), 'ACTIVE', ['HOTSITE']);

      const nodes = await explain(repo.buildNotEntitledQuery('LEAD_FORM', NOW));

      const itemScans = nodes.filter((node) => node['Relation Name'] === 'subscription_items');
      expect(itemScans.length).toBeGreaterThan(0);
      expect(itemScans.some((node) => node['Node Type'] === 'Seq Scan')).toBe(false);
    });
  });
});
