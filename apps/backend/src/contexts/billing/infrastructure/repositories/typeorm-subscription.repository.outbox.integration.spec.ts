import { DataSource, Repository } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { InboxRecordEntity } from '../../../../shared/infrastructure/inbox/inbox-record.entity';
import { TypeOrmInboxRepository } from '../../../../shared/infrastructure/inbox/typeorm-inbox.repository';
import { OutboxEventEntity } from '../../../../shared/infrastructure/outbox/outbox-event.entity';
import { OutboxPublisher } from '../../../../shared/infrastructure/outbox/outbox-publisher';
import { OutboxRelayService } from '../../../../shared/infrastructure/outbox/outbox-relay.service';
import { TypeOrmOutboxRepository } from '../../../../shared/infrastructure/outbox/typeorm-outbox.repository';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { SubscriptionEntityBuilder } from '../../../../test/builders/billing';
import { makeConfigService } from '../../../../test/infrastructure/fake-config-service';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { createTestDataSource } from '../../../../test/test-datasource';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { TypeOrmSubscriptionRepository } from './typeorm-subscription.repository';

// The subscription write and the events the aggregate raised leave one outcome together: both
// durable on commit, neither on rollback. This runs the REAL outbox publisher (the billing
// integration app replaces it with an in-process bus), so it reads `shared.outbox` itself.
describe('TypeOrmSubscriptionRepository → outbox (integration)', () => {
  let dataSource: DataSource;
  let txManager: TypeOrmTransactionManager;
  let repo: TypeOrmSubscriptionRepository;
  let outboxRows: Repository<OutboxEventEntity>;
  const tenants: string[] = [];

  const newTenant = (): string => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    return tenantId;
  };

  const seed = async (tenantId: string): Promise<void> => {
    await dataSource
      .getRepository(SubscriptionEntity)
      .insert(new SubscriptionEntityBuilder().withTenantId(tenantId).withStatus('ACTIVE').build());
  };

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(dataSource);
    const outboxRepo = new TypeOrmOutboxRepository(dataSource.getRepository(OutboxEventEntity));
    const config = makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: false });
    const relay = new OutboxRelayService(
      outboxRepo,
      new InMemoryEventBus(),
      new TypeOrmInboxRepository(dataSource.getRepository(InboxRecordEntity)),
      config,
      txManager,
    );
    repo = new TypeOrmSubscriptionRepository(
      dataSource.getRepository(SubscriptionEntity),
      new OutboxPublisher(outboxRepo, relay, config),
    );
    outboxRows = dataSource.getRepository(OutboxEventEntity);
  });

  afterEach(async () => {
    if (tenants.length > 0) {
      await dataSource.query(`DELETE FROM "shared"."outbox" WHERE "tenant_id" = ANY($1::uuid[])`, [
        tenants,
      ]);
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

  it('commits the subscription change and exactly one SubscriptionSuspended outbox row together', async () => {
    const tenantId = newTenant();
    await seed(tenantId);

    await txManager.run(async () => {
      const subscription = await repo.findByTenantIdForUpdate(tenantId);
      subscription?.suspendByOperator(new Date(), 'corr-outbox');
      if (subscription) await repo.save(subscription);
    });

    const row = await dataSource.getRepository(SubscriptionEntity).findOneByOrFail({ tenantId });
    expect(row).toMatchObject({ status: 'SUSPENDED', suspensionReason: 'OPERATOR' });
    const events = await outboxRows.find({ where: { tenantId } });
    expect(events.map((event) => event.eventName)).toEqual(['SubscriptionSuspended']);
    expect(events[0]?.payload).toMatchObject({ correlationId: 'corr-outbox' });
  });

  it('leaves neither the subscription change nor an outbox row when the transaction rolls back', async () => {
    const tenantId = newTenant();
    await seed(tenantId);

    await expect(
      txManager.run(async () => {
        const subscription = await repo.findByTenantIdForUpdate(tenantId);
        subscription?.suspendByOperator(new Date(), 'corr-rollback');
        if (subscription) await repo.save(subscription);
        throw new Error('a later step failed');
      }),
    ).rejects.toThrow('a later step failed');

    const row = await dataSource.getRepository(SubscriptionEntity).findOneByOrFail({ tenantId });
    expect(row).toMatchObject({ status: 'ACTIVE', suspensionReason: null, version: 0 });
    expect(await outboxRows.find({ where: { tenantId } })).toHaveLength(0);
  });
});
