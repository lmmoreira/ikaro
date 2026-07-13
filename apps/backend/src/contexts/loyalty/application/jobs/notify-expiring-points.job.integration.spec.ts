import { DataSource } from 'typeorm';
import { IEventBus } from '../../../../shared/ports/event-bus.port';
import { IOutboxPublisher } from '../../../../shared/ports/outbox-publisher.port';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { OutboxPublisher } from '../../../../shared/infrastructure/outbox/outbox-publisher';
import { OutboxRelayService } from '../../../../shared/infrastructure/outbox/outbox-relay.service';
import { TypeOrmOutboxRepository } from '../../../../shared/infrastructure/outbox/typeorm-outbox.repository';
import { OutboxEventEntity } from '../../../../shared/infrastructure/outbox/outbox-event.entity';
import { makeConfigService } from '../../../../test/infrastructure/fake-config-service';
import { createTestDataSource } from '../../../../test/test-datasource';
import { InMemoryLoyaltyEntryRepository } from '../../../../test/infrastructure/in-memory-loyalty-entry.repository';
import { InMemoryLoyaltyPlatformPort } from '../../../../test/infrastructure/in-memory-loyalty-platform.port';
import { LoyaltyEntryBuilder } from '../../../../test/builders/loyalty/index';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { NotifyExpiringPointsJob } from './notify-expiring-points.job';

// TD24-S03: same real-outbox proof as the two booking jobs, for the loyalty cron job.
describe('NotifyExpiringPointsJob (integration, TD24-S03 cron double-send fix)', () => {
  let ds: DataSource;
  let txManager: TypeOrmTransactionManager;
  let outboxRepo: TypeOrmOutboxRepository;
  let eventBus: jest.Mocked<IEventBus>;

  beforeAll(async () => {
    ds = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(ds);
    outboxRepo = new TypeOrmOutboxRepository(ds.getRepository(OutboxEventEntity));
  });

  afterAll(async () => {
    await ds.destroy();
  });

  beforeEach(() => {
    eventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IEventBus>;
  });

  function makeOutboxPublisher(): IOutboxPublisher {
    const config = makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: false });
    const relay = new OutboxRelayService(outboxRepo, eventBus, config);
    return new OutboxPublisher(outboxRepo, relay, config);
  }

  it('two overlapping runs for the same day → exactly one outbox row, relay delivers exactly one message', async () => {
    const tenantId = uuidv7();
    const customerId = uuidv7();
    const entryRepo = new InMemoryLoyaltyEntryRepository();
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(tenantId)
        .withCustomerId(customerId)
        .withPoints(10)
        .withExpiresAt(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))
        .build(),
    );

    const job = new NotifyExpiringPointsJob(
      entryRepo,
      makeOutboxPublisher(),
      new InMemoryLoyaltyPlatformPort(),
      txManager,
    );

    const now = new Date();
    await job.run(now);
    await job.run(now);

    const rows = await ds
      .getRepository(OutboxEventEntity)
      .find({ where: { eventName: 'PointsExpiringSoon', tenantId } });
    expect(rows).toHaveLength(1);

    const relay = new OutboxRelayService(outboxRepo, eventBus, makeConfigService());
    await relay.relay([rows[0].id]);

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });
});
