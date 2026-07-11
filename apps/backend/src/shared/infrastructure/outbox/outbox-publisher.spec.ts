import { makeConfigService } from '../../../test/infrastructure/fake-config-service';
import { Command } from '../../domain/command';
import { DomainEvent } from '../../domain/domain-event';
import { IOutboxRepository } from '../../ports/outbox-repository.port';
import { OutboxPublisher } from './outbox-publisher';
import { OutboxRelayService } from './outbox-relay.service';

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
  });
});
