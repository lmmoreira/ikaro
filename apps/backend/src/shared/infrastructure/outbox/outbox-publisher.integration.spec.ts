import { DataSource, Repository } from 'typeorm';
import { TenantEntity } from '../../../contexts/platform/infrastructure/entities/tenant.entity';
import { TenantEntityBuilder } from '../../../test/builders/platform/tenant-entity.builder';
import { makeConfigService } from '../../../test/infrastructure/fake-config-service';
import { StubCommand, StubEvent } from '../../../test/infrastructure/stub-envelope-classes';
import { createTestDataSource } from '../../../test/test-datasource';
import { uuidv7 } from '../../domain/uuid-v7';
import { IEventBus } from '../../ports/event-bus.port';
import { getActiveEntityManager } from '../transaction-context';
import { TypeOrmTransactionManager } from '../typeorm-transaction-manager';
import { OutboxEventEntity } from './outbox-event.entity';
import { OutboxPublisher } from './outbox-publisher';
import { OutboxRelayService } from './outbox-relay.service';
import { TypeOrmOutboxRepository } from './typeorm-outbox.repository';

describe('OutboxPublisher (integration)', () => {
  let ds: DataSource;
  let outboxRepo: Repository<OutboxEventEntity>;
  let typeOrmOutboxRepo: TypeOrmOutboxRepository;
  let tenantRepo: Repository<TenantEntity>;
  let txManager: TypeOrmTransactionManager;
  let eventBus: jest.Mocked<IEventBus>;

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
    eventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IEventBus>;
  });

  function makePublisher(inlineDispatchEnabled = true): OutboxPublisher {
    const config = makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: inlineDispatchEnabled });
    const relay = new OutboxRelayService(typeOrmOutboxRepo, eventBus, config);
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
    expect(eventBus.publish).not.toHaveBeenCalled();
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
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('rejects when published outside any transaction (TD24-S03 — every publish site must wrap itself)', async () => {
    const publisher = makePublisher(false);
    const event = new StubEvent(uuidv7(), uuidv7(), { value: 'x' });

    await expect(publisher.publish(event)).rejects.toThrow('has no ambient transaction');

    const outboxRow = await outboxRepo.findOne({ where: { id: event.eventId } });
    expect(outboxRow).toBeNull();
  });

  it('is a no-op on a conflicting dedup_key — no new row, no dispatch for the losing attempt', async () => {
    const publisher = makePublisher(true);
    const tenantId = uuidv7();
    const dedupKey = `business-key-${uuidv7()}`;
    // Two Commands with different eventIds but the same dedupKey — mirrors a retried/overlapping
    // cron run constructing the same business fact twice.
    const first = new StubCommand(tenantId, uuidv7(), { value: 'x' }, dedupKey);

    // Each publish in its own transaction — mirrors two independent (overlapping/retried) job
    // runs each wrapping their own publish batch in txManager.run() (TD24-S03).
    await txManager.run(() => publisher.publish(first));
    eventBus.publish.mockClear();

    const second = new StubCommand(tenantId, uuidv7(), { value: 'y' }, dedupKey);
    await txManager.run(() => publisher.publish(second));

    const rows = await outboxRepo.find({ where: { dedupKey } });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.eventId);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('after-commit error isolation: a failing inline dispatch does not stop another event in the same tx from dispatching, and txManager.run() resolves normally', async () => {
    const publisher = makePublisher(true);
    const tenantId = uuidv7();
    const event1 = new StubEvent(tenantId, uuidv7(), { value: 'x' });
    const event2 = new StubEvent(tenantId, uuidv7(), { value: 'y' });

    eventBus.publish
      .mockRejectedValueOnce(new Error('pubsub down for event1'))
      .mockResolvedValueOnce(undefined);

    await expect(
      txManager.run(async () => {
        await publisher.publish(event1);
        await publisher.publish(event2);
      }),
    ).resolves.toBeUndefined();

    expect(eventBus.publish).toHaveBeenCalledTimes(2);

    const row1 = await outboxRepo.findOne({ where: { id: event1.eventId } });
    const row2 = await outboxRepo.findOne({ where: { id: event2.eventId } });
    expect(row1!.publishedAt).toBeNull();
    expect(row2!.publishedAt).not.toBeNull();
  });
});
