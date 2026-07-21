import { ITracingPort } from '@ikaro/observability';
import { makeConfigService } from '../../../test/infrastructure/fake-config-service';
import { StubCommand, StubEvent } from '../../../test/infrastructure/stub-envelope-classes';
import { IOutboxRepository } from '../../ports/outbox-repository.port';
import { OutboxPublisher } from './outbox-publisher';
import { OutboxRelayService } from './outbox-relay.service';

// Injects a fixed, recognisable carrier instead of talking to real OTel primitives — this suite
// only needs to prove OutboxPublisher captures whatever ITracingPort.injectContext() produces
// onto the event before insert (TD28); the inject/extract linkage itself is covered by
// packages/observability/src/otel-tracing-adapter.spec.ts.
class FakeTracingPort implements ITracingPort {
  setActiveSpanAttributes(): void {
    /* unused by this suite */
  }
  getActiveTraceContext(): undefined {
    return undefined;
  }
  injectContext(carrier: Record<string, string>): void {
    carrier['traceparent'] = '00-fake-trace-01';
  }
  runWithExtractedContext<T>(_carrier: Record<string, string>, fn: () => T): T {
    return fn();
  }
}

describe('OutboxPublisher', () => {
  let outboxRepo: jest.Mocked<IOutboxRepository>;
  let relay: jest.Mocked<OutboxRelayService>;

  beforeEach(() => {
    outboxRepo = {
      insert: jest.fn(),
      findUnpublishedById: jest.fn(),
      markPublished: jest.fn(),
      claimUnpublished: jest.fn(),
      runInTransaction: jest.fn(),
      deleteOldPublished: jest.fn(),
    } as unknown as jest.Mocked<IOutboxRepository>;
    relay = {
      relay: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OutboxRelayService>;
  });

  describe('publish()', () => {
    it('uses eventId as the dedup key when the event has no dedupKey', async () => {
      outboxRepo.insert.mockResolvedValue('row-1');
      const publisher = new OutboxPublisher(outboxRepo, relay, makeConfigService());
      const event = new StubEvent('tenant-1', 'corr-1', { value: 'x' });

      await publisher.publish(event);

      expect(outboxRepo.insert).toHaveBeenCalledWith(event, event.eventId);
    });

    it('uses Command.dedupKey for a Command, ignoring eventId (cron-published events)', async () => {
      outboxRepo.insert.mockResolvedValue('row-1');
      const publisher = new OutboxPublisher(outboxRepo, relay, makeConfigService());
      const command = new StubCommand(
        'tenant-1',
        'corr-1',
        { value: 'x' },
        'PointsExpiringSoon:t1:c1:2026-07-11',
      );

      await publisher.publish(command);

      expect(outboxRepo.insert).toHaveBeenCalledWith(
        command,
        'PointsExpiringSoon:t1:c1:2026-07-11',
      );
    });

    it('schedules relay dispatch for the inserted row id when inline dispatch is enabled', async () => {
      outboxRepo.insert.mockResolvedValue('row-1');
      const publisher = new OutboxPublisher(
        outboxRepo,
        relay,
        makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: true }),
      );

      await publisher.publish(new StubEvent('tenant-1', 'corr-1', { value: 'x' }));

      expect(relay.relay).toHaveBeenCalledWith(['row-1']);
    });

    it('does not schedule dispatch when a conflicting insert returns no row', async () => {
      outboxRepo.insert.mockResolvedValue(undefined);
      const publisher = new OutboxPublisher(
        outboxRepo,
        relay,
        makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: true }),
      );

      await publisher.publish(new StubEvent('tenant-1', 'corr-1', { value: 'x' }));

      expect(relay.relay).not.toHaveBeenCalled();
    });

    it('does not schedule dispatch when OUTBOX_INLINE_DISPATCH_ENABLED=false', async () => {
      outboxRepo.insert.mockResolvedValue('row-1');
      const publisher = new OutboxPublisher(
        outboxRepo,
        relay,
        makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: false }),
      );

      await publisher.publish(new StubEvent('tenant-1', 'corr-1', { value: 'x' }));

      expect(relay.relay).not.toHaveBeenCalled();
    });

    it('swallows a relay failure — publish() never rejects', async () => {
      outboxRepo.insert.mockResolvedValue('row-1');
      relay.relay.mockRejectedValue(new Error('pubsub down'));
      const publisher = new OutboxPublisher(
        outboxRepo,
        relay,
        makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: true }),
      );

      await expect(
        publisher.publish(new StubEvent('tenant-1', 'corr-1', { value: 'x' })),
      ).resolves.toBeUndefined();
    });

    it('captures the active trace context onto the event before inserting it (TD28)', async () => {
      outboxRepo.insert.mockResolvedValue('row-1');
      const publisher = new OutboxPublisher(
        outboxRepo,
        relay,
        makeConfigService(),
        new FakeTracingPort(),
      );
      const event = new StubEvent('tenant-1', 'corr-1', { value: 'x' });

      await publisher.publish(event);

      expect(event.traceContext).toEqual({ traceparent: '00-fake-trace-01' });
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ traceContext: { traceparent: '00-fake-trace-01' } }),
        event.eventId,
      );
    });
  });
});
