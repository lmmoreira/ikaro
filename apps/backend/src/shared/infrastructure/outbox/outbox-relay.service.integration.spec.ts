import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';

const mockPublishMessage = jest.fn().mockResolvedValue('msg-id');
const mockTopicExists = jest.fn().mockResolvedValue([true]);

// Module-level mock (hoisted above imports by ts-jest, same pattern as
// gcp-pubsub-event-bus.adapter.spec.ts) — only the "transport round-trip" describe block below
// constructs a real GcpPubSubEventBusAdapter; every other test in this file uses a hand-rolled
// fake object, which never touches this mock.
jest.mock('@google-cloud/pubsub', () => ({
  PubSub: jest.fn().mockImplementation(() => ({
    topic: jest.fn().mockReturnValue({
      exists: mockTopicExists,
      publishMessage: mockPublishMessage,
    }),
  })),
}));

import { OutboxEventEntityBuilder } from '../../../test/builders/shared/outbox-event-entity.builder';
import { makeConfigService } from '../../../test/infrastructure/fake-config-service';
import { createTestDataSource } from '../../../test/test-datasource';
import { uuidv7 } from '../../domain/uuid-v7';
import { IEventBus } from '../../ports/event-bus.port';
import { GcpPubSubEventBusAdapter } from '../event-bus/gcp-pubsub-event-bus.adapter';
import { OutboxEventEntity } from './outbox-event.entity';
import { OutboxRelayService } from './outbox-relay.service';
import { TypeOrmOutboxRepository } from './typeorm-outbox.repository';

describe('OutboxRelayService (integration)', () => {
  let ds: DataSource;
  let outboxRepo: Repository<OutboxEventEntity>;
  let typeOrmOutboxRepo: TypeOrmOutboxRepository;

  beforeAll(async () => {
    ds = await createTestDataSource();
    outboxRepo = ds.getRepository(OutboxEventEntity);
    typeOrmOutboxRepo = new TypeOrmOutboxRepository(outboxRepo);
  });

  afterAll(async () => {
    await ds.destroy();
  });

  describe('relay(rowIds) — inline dispatch path', () => {
    it('marks published_at only after a successful publish', async () => {
      const eventBus = {
        publish: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<IEventBus>;
      const service = new OutboxRelayService(typeOrmOutboxRepo, eventBus, makeConfigService());
      const row = new OutboxEventEntityBuilder().withPayload({ eventName: 'StubEvent' }).build();
      await outboxRepo.save(row);

      await service.relay([row.id]);

      const updated = await outboxRepo.findOne({ where: { id: row.id } });
      expect(updated!.publishedAt).not.toBeNull();
    });

    it('leaves the row unpublished when the publish fails', async () => {
      const eventBus = {
        publish: jest.fn().mockRejectedValue(new Error('pubsub down')),
      } as unknown as jest.Mocked<IEventBus>;
      const service = new OutboxRelayService(typeOrmOutboxRepo, eventBus, makeConfigService());
      const row = new OutboxEventEntityBuilder().withPayload({ eventName: 'StubEvent' }).build();
      await outboxRepo.save(row);

      await service.relay([row.id]);

      const updated = await outboxRepo.findOne({ where: { id: row.id } });
      expect(updated!.publishedAt).toBeNull();
    });
  });

  describe('sweep (relay() with no rowIds)', () => {
    it('respects the grace window — a fresh row is left untouched, an old row is published', async () => {
      const eventBus = {
        publish: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<IEventBus>;
      const dedup = uuidv7();
      const freshRow = new OutboxEventEntityBuilder()
        .withDedupKey(`fresh-${dedup}`)
        .withCreatedAt(new Date())
        .withPayload({ eventName: 'StubEvent' })
        .build();
      const oldRow = new OutboxEventEntityBuilder()
        .withDedupKey(`old-${dedup}`)
        .withCreatedAt(new Date(Date.now() - 60_000))
        .withPayload({ eventName: 'StubEvent' })
        .build();
      await outboxRepo.save([freshRow, oldRow]);

      const service = new OutboxRelayService(
        typeOrmOutboxRepo,
        eventBus,
        makeConfigService({ OUTBOX_SWEEP_GRACE_SECONDS: 30 }),
      );
      await service.relay();

      const freshAfter = await outboxRepo.findOne({ where: { id: freshRow.id } });
      const oldAfter = await outboxRepo.findOne({ where: { id: oldRow.id } });
      expect(freshAfter!.publishedAt).toBeNull();
      expect(oldAfter!.publishedAt).not.toBeNull();
    });

    it('loops across multiple batches until the batch comes back empty', async () => {
      const eventBus = {
        publish: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<IEventBus>;
      const dedup = uuidv7();
      const rows = Array.from({ length: 5 }, (_, i) =>
        new OutboxEventEntityBuilder()
          .withDedupKey(`batch-${dedup}-${i}`)
          .withCreatedAt(new Date(Date.now() - 60_000))
          .withPayload({ eventName: 'StubEvent' })
          .build(),
      );
      await outboxRepo.save(rows);

      const service = new OutboxRelayService(
        typeOrmOutboxRepo,
        eventBus,
        makeConfigService({ OUTBOX_SWEEP_GRACE_SECONDS: 0, OUTBOX_SWEEP_BATCH_SIZE: 2 }),
      );
      await service.relay();

      // Per-row checks only, not an aggregate eventBus.publish call count — the sweep scans the
      // whole shared.outbox table with no per-test scoping, so an unrelated leftover row from
      // another concurrently-running test file (same shared Testcontainers Postgres instance)
      // can legitimately add extra calls without indicating a bug in this test's own 5 rows.
      for (const row of rows) {
        const updated = await outboxRepo.findOne({ where: { id: row.id } });
        expect(updated!.publishedAt).not.toBeNull();
      }
    });

    it('SKIP LOCKED: two concurrent sweeps on the same rows publish each row exactly once', async () => {
      const publishedDedupKeys: string[] = [];
      const eventBus = {
        publish: jest.fn().mockImplementation(async (event: { dedupKeyMarker?: string }) => {
          if (event.dedupKeyMarker) publishedDedupKeys.push(event.dedupKeyMarker);
        }),
      } as unknown as jest.Mocked<IEventBus>;
      const dedup = uuidv7();
      const rows = Array.from({ length: 4 }, (_, i) => {
        const dedupKey = `concurrent-${dedup}-${i}`;
        return new OutboxEventEntityBuilder()
          .withDedupKey(dedupKey)
          .withCreatedAt(new Date(Date.now() - 60_000))
          .withPayload({ eventName: 'StubEvent', dedupKeyMarker: dedupKey })
          .build();
      });
      await outboxRepo.save(rows);

      const service = new OutboxRelayService(
        typeOrmOutboxRepo,
        eventBus,
        makeConfigService({ OUTBOX_SWEEP_GRACE_SECONDS: 0, OUTBOX_SWEEP_BATCH_SIZE: 10 }),
      );

      await Promise.all([service.relay(), service.relay()]);

      // Filtered by this test's own dedupKeyMarker — immune to any unrelated row another
      // concurrently-running test/file may also have swept in the same shared table.
      for (const row of rows) {
        const updated = await outboxRepo.findOne({ where: { id: row.id } });
        expect(updated!.publishedAt).not.toBeNull();
        const timesPublished = publishedDedupKeys.filter((k) => k === row.dedupKey).length;
        expect(timesPublished).toBe(1);
      }
    });
  });

  describe('retention GC', () => {
    it('deletes only published rows older than OUTBOX_RETENTION_DAYS', async () => {
      const eventBus = {
        publish: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<IEventBus>;
      const dedup = uuidv7();
      const oldPublished = new OutboxEventEntityBuilder()
        .withDedupKey(`gc-old-${dedup}`)
        .withPublishedAt(new Date(Date.now() - 20 * 24 * 60 * 60 * 1000))
        .withPayload({ eventName: 'StubEvent' })
        .build();
      const recentPublished = new OutboxEventEntityBuilder()
        .withDedupKey(`gc-recent-${dedup}`)
        .withPublishedAt(new Date())
        .withPayload({ eventName: 'StubEvent' })
        .build();
      const unpublished = new OutboxEventEntityBuilder()
        .withDedupKey(`gc-unpub-${dedup}`)
        .withCreatedAt(new Date())
        .withPayload({ eventName: 'StubEvent' })
        .build();
      await outboxRepo.save([oldPublished, recentPublished, unpublished]);

      // Grace window set very high so the sweep itself claims nothing — isolates this test to GC.
      const service = new OutboxRelayService(
        typeOrmOutboxRepo,
        eventBus,
        makeConfigService({ OUTBOX_RETENTION_DAYS: 14, OUTBOX_SWEEP_GRACE_SECONDS: 999_999 }),
      );
      await service.relay();

      expect(await outboxRepo.findOne({ where: { id: oldPublished.id } })).toBeNull();
      expect(await outboxRepo.findOne({ where: { id: recentPublished.id } })).not.toBeNull();
      expect(await outboxRepo.findOne({ where: { id: unpublished.id } })).not.toBeNull();
    });
  });

  describe('transport round-trip (real GcpPubSubEventBusAdapter, mocked @google-cloud/pubsub client)', () => {
    it('relays the stored envelope byte-identical through JSONB storage and the Pub/Sub publish call', async () => {
      mockPublishMessage.mockClear();
      const realConfig = {
        getOrThrow: (key: string): string => {
          if (key === 'PUBSUB_PROJECT_ID') return 'ikaro-local';
          throw new Error(`Unknown config key: ${key}`);
        },
        get: (key: string, defaultValue?: unknown): unknown => {
          if (key === 'PUBSUB_AUTO_CREATE') return true;
          return defaultValue;
        },
      } as unknown as ConfigService;
      const realAdapter = new GcpPubSubEventBusAdapter(realConfig);

      const originalEnvelope = {
        eventId: uuidv7(),
        tenantId: '10000000-0000-4000-8000-000000000001',
        occurredAt: new Date().toISOString(),
        correlationId: uuidv7(),
        eventName: 'StubEvent',
        eventVersion: 1,
        data: { value: 'round-trip' },
      };
      const row = new OutboxEventEntityBuilder()
        .withId(originalEnvelope.eventId)
        .withDedupKey(originalEnvelope.eventId)
        .withTenantId(originalEnvelope.tenantId)
        .withEventName(originalEnvelope.eventName)
        .withPayload(originalEnvelope)
        .build();
      await outboxRepo.save(row);

      const service = new OutboxRelayService(typeOrmOutboxRepo, realAdapter, makeConfigService());
      await service.relay([row.id]);

      expect(mockPublishMessage).toHaveBeenCalledTimes(1);
      const published = mockPublishMessage.mock.calls[0][0] as { data: Buffer };
      const publishedEnvelope = JSON.parse(published.data.toString()) as typeof originalEnvelope;
      expect(publishedEnvelope).toEqual(originalEnvelope);
    });
  });
});
