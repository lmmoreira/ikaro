import { DataSource, Repository } from 'typeorm';
import { TenantEntity } from '../../../contexts/platform/infrastructure/entities/tenant.entity';
import { TenantEntityBuilder } from '../../../test/builders/platform/tenant-entity.builder';
import { makeConfigService } from '../../../test/infrastructure/fake-config-service';
import { createTestDataSource } from '../../../test/test-datasource';
import { Command } from '../../domain/command';
import { DomainEvent } from '../../domain/domain-event';
import { uuidv7 } from '../../domain/uuid-v7';
import { GcpPubSubEventBusAdapter } from '../gcp-pubsub-event-bus.adapter';
import { getActiveEntityManager } from '../transaction-context';
import { TypeOrmTransactionManager } from '../typeorm-transaction-manager';
import { OutboxEventEntity } from './outbox-event.entity';
import { OutboxPublisher } from './outbox-publisher';
import { OutboxRelayService } from './outbox-relay.service';
import { TypeOrmOutboxRepository } from './typeorm-outbox.repository';

class StubEvent extends DomainEvent<{ value: string }> {
  readonly eventVersion = 1;
  readonly data: { value: string };
  constructor(tenantId: string, correlationId: string, data: { value: string }) {
    super(tenantId, correlationId);
    this.data = data;
  }
}

class StubCommand extends Command<{ value: string }> {
  readonly eventVersion = 1;
  readonly data: { value: string };
  constructor(tenantId: string, correlationId: string, data: { value: string }, dedupKey: string) {
    super(tenantId, correlationId, dedupKey);
    this.data = data;
  }
}

describe('OutboxPublisher (integration)', () => {
  let ds: DataSource;
  let outboxRepo: Repository<OutboxEventEntity>;
  let typeOrmOutboxRepo: TypeOrmOutboxRepository;
  let tenantRepo: Repository<TenantEntity>;
  let txManager: TypeOrmTransactionManager;
  let innerBus: jest.Mocked<GcpPubSubEventBusAdapter>;

  beforeAll(async () => {
    ds = await createTestDataSource();
    outboxRepo = ds.getRepository(OutboxEventEntity);
    typeOrmOutboxRepo = new TypeOrmOutboxRepository(outboxRepo);
    tenantRepo = ds.getRepository(TenantEntity);
    txManager = new TypeOrmTransactionManager(ds);
  });

  afterAll(async () => {
    await ds.destroy();
  });

  beforeEach(() => {
    innerBus = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<GcpPubSubEventBusAdapter>;
  });

  function makePublisher(inlineDispatchEnabled = true): OutboxPublisher {
    const config = makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: inlineDispatchEnabled });
    const relay = new OutboxRelayService(typeOrmOutboxRepo, innerBus, config);
    return new OutboxPublisher(typeOrmOutboxRepo, relay, config);
  }

  it('rolls back the outbox row together with the business write when the transaction throws', async () => {
    const publisher = makePublisher();
    const tenantId = uuidv7();
    const event = new StubEvent(tenantId, uuidv7(), { value: 'x' });

    await expect(
      txManager.run(async () => {
        // Must use the ambient EntityManager (not the base-DataSource-bound tenantRepo) to
        // actually join this transaction — a plain repo.save() would commit standalone.
        await getActiveEntityManager()!.save(
          TenantEntity,
          new TenantEntityBuilder().withId(tenantId).withSlug(`outbox-eb-rb-${tenantId}`).build(),
        );
        await publisher.publish(event);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    expect(await outboxRepo.findOne({ where: { id: event.eventId } })).toBeNull();
    expect(await tenantRepo.findOne({ where: { id: tenantId } })).toBeNull();
    expect(innerBus.publish).not.toHaveBeenCalled();
  });

  it('commits the outbox row together with the business write and dispatches inline after commit', async () => {
    const publisher = makePublisher(true);
    const tenantId = uuidv7();
    const event = new StubEvent(tenantId, uuidv7(), { value: 'x' });

    await txManager.run(async () => {
      await getActiveEntityManager()!.save(
        TenantEntity,
        new TenantEntityBuilder().withId(tenantId).withSlug(`outbox-eb-commit-${tenantId}`).build(),
      );
      await publisher.publish(event);
    });

    const outboxRow = await outboxRepo.findOne({ where: { id: event.eventId } });
    expect(outboxRow).not.toBeNull();
    expect(outboxRow!.publishedAt).not.toBeNull();
    expect(await tenantRepo.findOne({ where: { id: tenantId } })).not.toBeNull();
    expect(innerBus.publish).toHaveBeenCalledTimes(1);
  });

  it('commits the outbox row standalone when published outside any transaction', async () => {
    const publisher = makePublisher(false);
    const event = new StubEvent(uuidv7(), uuidv7(), { value: 'x' });

    await publisher.publish(event);

    const outboxRow = await outboxRepo.findOne({ where: { id: event.eventId } });
    expect(outboxRow).not.toBeNull();
    expect(outboxRow!.publishedAt).toBeNull(); // inline dispatch disabled for this instance
  });

  it('is a no-op on a conflicting dedup_key — no new row, no dispatch for the losing attempt', async () => {
    const publisher = makePublisher(true);
    const tenantId = uuidv7();
    const dedupKey = `business-key-${uuidv7()}`;
    // Two Commands with different eventIds but the same dedupKey — mirrors a retried/overlapping
    // cron run constructing the same business fact twice.
    const first = new StubCommand(tenantId, uuidv7(), { value: 'x' }, dedupKey);

    await publisher.publish(first);
    innerBus.publish.mockClear();

    const second = new StubCommand(tenantId, uuidv7(), { value: 'y' }, dedupKey);
    await publisher.publish(second);

    const rows = await outboxRepo.find({ where: { dedupKey } });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.eventId);
    expect(innerBus.publish).not.toHaveBeenCalled();
  });

  it('after-commit error isolation: a failing inline dispatch does not stop another event in the same tx from dispatching, and txManager.run() resolves normally', async () => {
    const publisher = makePublisher(true);
    const tenantId = uuidv7();
    const event1 = new StubEvent(tenantId, uuidv7(), { value: 'x' });
    const event2 = new StubEvent(tenantId, uuidv7(), { value: 'y' });

    innerBus.publish
      .mockRejectedValueOnce(new Error('pubsub down for event1'))
      .mockResolvedValueOnce(undefined);

    await expect(
      txManager.run(async () => {
        await publisher.publish(event1);
        await publisher.publish(event2);
      }),
    ).resolves.toBeUndefined();

    expect(innerBus.publish).toHaveBeenCalledTimes(2);

    const row1 = await outboxRepo.findOne({ where: { id: event1.eventId } });
    const row2 = await outboxRepo.findOne({ where: { id: event2.eventId } });
    expect(row1!.publishedAt).toBeNull();
    expect(row2!.publishedAt).not.toBeNull();
  });
});
