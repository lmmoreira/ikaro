import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ChargeBuilder, SubscriptionEntityBuilder } from '../../../../test/builders/billing';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { createTestDataSource } from '../../../../test/test-datasource';
import { Charge } from '../../domain/charge.aggregate';
import { ChargeEntity } from '../entities/charge.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { OPERATOR_CHARGE_SUMMARY_SQL } from './typeorm-charge.operator-summary';
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

describe('TypeOrmChargeRepository.summarizeForOperator (integration)', () => {
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

  it('answers the last non-cancelled charge, the oldest overdue due date and the open recovery of each tenant', async () => {
    const t = await newTenant();
    await seed(t, (b) =>
      b.withPeriod('2026-08-01', '2026-08-31').withDueDate('2026-08-10').withStatus('OVERDUE'),
    );
    await seed(t, (b) =>
      b.withPeriod('2026-09-01', '2026-09-30').withDueDate('2026-09-10').withStatus('OVERDUE'),
    );
    const latestCancelled = await seed(t, (b) =>
      b.withPeriod('2026-10-01', '2026-10-31').withDueDate('2026-10-10').withStatus('CANCELED'),
    );
    const recovery = await seed(t, (b) => b.asRecovery().withDueDate('2026-10-05'));

    const [summary] = await repo.summarizeForOperator([t.tenantId]);

    expect(summary.tenantId).toBe(t.tenantId);
    // The cancelled October charge is not "last"; the recovery (due 10-05) is the latest live one.
    expect(summary.lastCharge).toMatchObject({
      id: recovery.id,
      kind: 'RECOVERY',
      status: 'PENDING',
      currency: 'BRL',
      dueDate: '2026-10-05',
    });
    expect(summary.lastCharge?.id).not.toBe(latestCancelled.id);
    expect(typeof summary.lastCharge?.amountMinor).toBe('number');
    expect(summary.oldestOverdueDueDate).toBe('2026-08-10');
    expect(summary.openRecovery?.id).toBe(recovery.id);
  });

  it('leaves a tenant with no charge out, and reports no recovery or overdue for one without them', async () => {
    const empty = await newTenant();
    const paidOnly = await newTenant();
    await seed(paidOnly, (b) => b.withPaid('PIX', new Date('2026-09-01T00:00:00Z')));

    const result = await repo.summarizeForOperator([empty.tenantId, paidOnly.tenantId]);

    expect(result.map((row) => row.tenantId)).toEqual([paidOnly.tenantId]);
    expect(result[0]).toMatchObject({
      oldestOverdueDueDate: null,
      openRecovery: null,
      lastCharge: { status: 'PAID' },
    });
  });

  it('never lets a tenant outside the page, or another tenant, leak into a row', async () => {
    const inPage = await newTenant();
    const outsidePage = await newTenant();
    await seed(inPage, (b) => b.withDueDate('2026-09-10').withStatus('OVERDUE'));
    await seed(outsidePage, (b) => b.withDueDate('2026-10-10').withStatus('OVERDUE'));
    await seed(outsidePage, (b) => b.asRecovery().withDueDate('2026-10-12'));

    const result = await repo.summarizeForOperator([inPage.tenantId]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      tenantId: inPage.tenantId,
      oldestOverdueDueDate: '2026-09-10',
      openRecovery: null,
    });
    expect(result[0].lastCharge?.dueDate).toBe('2026-09-10');
  });

  it('answers empty for no ids without a query', async () => {
    const spy = jest.spyOn(dataSource.manager, 'query');

    await expect(repo.summarizeForOperator([])).resolves.toEqual([]);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('serves all three facts from IDX_billing_charges_history (EXPLAIN asserted)', async () => {
    const t = await newTenant();
    await seed(t, (b) => b);
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('SET LOCAL enable_seqscan = off');
      const [{ 'QUERY PLAN': plan }] = await runner.query(
        `EXPLAIN (FORMAT JSON) ${OPERATOR_CHARGE_SUMMARY_SQL}`,
        [[t.tenantId]],
      );
      const indexes = collectNodes(plan[0].Plan as PlanNode)
        .map((node) => node['Index Name'])
        .filter((name): name is string => name !== undefined);

      expect(indexes).toContain('IDX_billing_charges_history');
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
