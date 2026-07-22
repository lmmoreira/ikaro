import { DataSource, Repository } from 'typeorm';
import { ITracingPort } from '@ikaro/observability';
import { TenantEntity } from '../../../contexts/platform/infrastructure/entities/tenant.entity';
import { TenantEntityBuilder } from '../../../test/builders/platform/tenant-entity.builder';
import { makeConfigService } from '../../../test/infrastructure/fake-config-service';
import { InMemoryInboxRepository } from '../../../test/infrastructure/in-memory-inbox.repository';
import { StubCommand, StubEvent } from '../../../test/infrastructure/stub-envelope-classes';
import { createTestDataSource } from '../../../test/test-datasource';
import { uuidv7 } from '../../domain/uuid-v7';
import { Envelope } from '../../domain/envelope';
import { IEventBus } from '../../ports/event-bus.port';
import { getActiveEntityManager } from '../transaction-context';
import { TypeOrmTransactionManager } from '../typeorm-transaction-manager';
import { OutboxEventEntity } from './outbox-event.entity';
import { OutboxPublishedOutsideTransactionError } from './outbox-published-outside-transaction.error';
import { OutboxPublisher } from './outbox-publisher';
import { OutboxRelayService } from './outbox-relay.service';
import { TypeOrmOutboxRepository } from './typeorm-outbox.repository';

// Models "which trace is active" as a plain mutable id instead of talking to real OTel
// primitives — apps/backend's own ESLint rule keeps raw @opentelemetry/* imports out of every
// file except packages/observability (that's where the real SDK-level inject/extract/span
// linkage is proven, packages/observability/src/otel-tracing-adapter.spec.ts). This fake's job
// is narrower and specific to this backend-integration test (PR review, 2026-07-21): prove that
// OutboxPublisher/OutboxRelayService thread the trace captured at *insert* time through to the
// consumer span, not whatever trace happens to be active when the sweep later relays the row.
class FakeTracingPort implements ITracingPort {
  private activeTraceId: string | undefined;
  readonly startedSpans: Array<{ name: string; parentTraceId: string | undefined }> = [];

  setActiveTraceId(id: string | undefined): void {
    this.activeTraceId = id;
  }

  setActiveSpanAttributes(): void {
    /* unused by this suite */
  }
  getActiveTraceContext(): undefined {
    return undefined;
  }

  injectContext(carrier: Record<string, string>): void {
    if (this.activeTraceId) {
      carrier['x-fake-trace-id'] = this.activeTraceId;
    }
  }

  runWithExtractedContext<T>(carrier: Record<string, string>, fn: () => T): T {
    const extracted = carrier['x-fake-trace-id'];
    const previous = this.activeTraceId;
    this.activeTraceId = extracted ?? previous;
    try {
      return fn();
    } finally {
      this.activeTraceId = previous;
    }
  }

  startActiveSpan<T>(name: string, fn: () => T): T {
    this.startedSpans.push({ name, parentTraceId: this.activeTraceId });
    return fn();
  }
}

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
    const relay = new OutboxRelayService(
      typeOrmOutboxRepo,
      eventBus,
      new InMemoryInboxRepository(),
      config,
    );
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

    await expect(publisher.publish(event)).rejects.toThrow(OutboxPublishedOutsideTransactionError);

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

  it('swept dispatch (TD28, PR review 2026-07-21): the consumer span links to the trace active when the event was inserted, not the trace active when the sweep later relays it', async () => {
    const tracingPort = new FakeTracingPort();
    const config = makeConfigService({
      OUTBOX_INLINE_DISPATCH_ENABLED: false, // stays unpublished, so relaying it below is what a later sweep would do
    });

    // Simulates exactly what GcpPubSubEventBusAdapter.publish() + PubSubPushController do in
    // production: forward the relayed envelope's traceContext into the "message attributes" and
    // extract + start the consumer span from it — using the same tracingPort instance the
    // publish side used, so a regression that captures the wrong trace (e.g. context.active() at
    // actual-publish time instead of the stored traceContext) would be caught here.
    eventBus.publish.mockImplementation(async (relayedEvent: Envelope) => {
      await tracingPort.runWithExtractedContext(relayedEvent.traceContext ?? {}, () =>
        tracingPort.startActiveSpan(`pubsub.event.${relayedEvent.eventName}`, () => undefined),
      );
    });

    const relay = new OutboxRelayService(
      typeOrmOutboxRepo,
      eventBus,
      new InMemoryInboxRepository(),
      config,
    );
    const publisher = new OutboxPublisher(typeOrmOutboxRepo, relay, config, tracingPort);
    const tenantId = uuidv7();
    const event = new StubEvent(tenantId, uuidv7(), { value: 'x' });

    // Original request: "origin-trace" is the active trace when the event is captured/persisted.
    tracingPort.setActiveTraceId('origin-trace');
    await txManager.run(() => publisher.publish(event));
    tracingPort.setActiveTraceId(undefined);

    // Time passes; a later, unrelated sweep tick runs under its own, different trace. Relayed by
    // this row's own id (not the table-wide sweep() batch) — this is a real Postgres test DB
    // shared with every other integration spec file, so a batch sweep with no filter would also
    // claim whatever other files' concurrently-running tests happen to leave unpublished. Targeting
    // this row specifically still exercises the identical eventBus.publish(asStoredEvent(row.payload))
    // call sweep() itself makes — same round-trip through real persistence, same mechanism.
    tracingPort.setActiveTraceId('sweep-trace');
    await relay.relay([event.eventId]);
    tracingPort.setActiveTraceId(undefined);

    expect(tracingPort.startedSpans).toEqual([
      { name: `pubsub.event.${StubEvent.name}`, parentTraceId: 'origin-trace' },
    ]);

    const row = await outboxRepo.findOne({ where: { id: event.eventId } });
    expect(row!.publishedAt).not.toBeNull();
  });
});
