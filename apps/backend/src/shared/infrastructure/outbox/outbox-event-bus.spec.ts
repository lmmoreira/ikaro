import { Repository } from 'typeorm';
import { makeConfigService } from '../../../test/infrastructure/fake-config-service';
import { Command } from '../../domain/command';
import { DomainEvent } from '../../domain/domain-event';
import { GcpPubSubEventBusAdapter } from '../gcp-pubsub-event-bus.adapter';
import { OutboxEventEntity } from './outbox-event.entity';
import { OutboxEventBus } from './outbox-event-bus';
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

describe('OutboxEventBus', () => {
  let repo: jest.Mocked<Repository<OutboxEventEntity>>;
  let innerBus: jest.Mocked<GcpPubSubEventBusAdapter>;
  let relay: jest.Mocked<OutboxRelayService>;

  beforeEach(() => {
    repo = { query: jest.fn() } as unknown as jest.Mocked<Repository<OutboxEventEntity>>;
    innerBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      registerTrigger: jest.fn(),
      publishTrigger: jest.fn(),
      dispatchPushMessage: jest.fn(),
    } as unknown as jest.Mocked<GcpPubSubEventBusAdapter>;
    relay = {
      relay: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OutboxRelayService>;
  });

  describe('publish()', () => {
    it('uses eventId as the dedup key when the event has no dedupKey', async () => {
      repo.query.mockResolvedValue([{ id: 'row-1' }]);
      const bus = new OutboxEventBus(repo, innerBus, relay, makeConfigService());
      const event = new StubEvent('tenant-1', 'corr-1', { value: 'x' });

      await bus.publish(event);

      expect(repo.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "shared"."outbox"'),
        [event.eventId, event.eventId, 'tenant-1', 'StubEvent', JSON.stringify(event)],
      );
    });

    it('uses Command.dedupKey for a Command, ignoring eventId (cron-published events)', async () => {
      repo.query.mockResolvedValue([{ id: 'row-1' }]);
      const bus = new OutboxEventBus(repo, innerBus, relay, makeConfigService());
      const command = new StubCommand(
        'tenant-1',
        'corr-1',
        { value: 'x' },
        'PointsExpiringSoon:t1:c1:2026-07-11',
      );

      await bus.publish(command);

      expect(repo.query).toHaveBeenCalledWith(expect.any(String), [
        command.eventId,
        'PointsExpiringSoon:t1:c1:2026-07-11',
        'tenant-1',
        'StubCommand',
        JSON.stringify(command),
      ]);
    });

    it('schedules relay dispatch for the inserted row id when inline dispatch is enabled', async () => {
      repo.query.mockResolvedValue([{ id: 'row-1' }]);
      const bus = new OutboxEventBus(
        repo,
        innerBus,
        relay,
        makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: true }),
      );

      await bus.publish(new StubEvent('tenant-1', 'corr-1', { value: 'x' }));

      expect(relay.relay).toHaveBeenCalledWith(['row-1']);
    });

    it('does not schedule dispatch when a conflicting insert returns no row', async () => {
      repo.query.mockResolvedValue([]);
      const bus = new OutboxEventBus(
        repo,
        innerBus,
        relay,
        makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: true }),
      );

      await bus.publish(new StubEvent('tenant-1', 'corr-1', { value: 'x' }));

      expect(relay.relay).not.toHaveBeenCalled();
    });

    it('does not schedule dispatch when OUTBOX_INLINE_DISPATCH_ENABLED=false', async () => {
      repo.query.mockResolvedValue([{ id: 'row-1' }]);
      const bus = new OutboxEventBus(
        repo,
        innerBus,
        relay,
        makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: false }),
      );

      await bus.publish(new StubEvent('tenant-1', 'corr-1', { value: 'x' }));

      expect(relay.relay).not.toHaveBeenCalled();
    });

    it('swallows a relay failure — publish() never rejects', async () => {
      repo.query.mockResolvedValue([{ id: 'row-1' }]);
      relay.relay.mockRejectedValue(new Error('pubsub down'));
      const bus = new OutboxEventBus(
        repo,
        innerBus,
        relay,
        makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: true }),
      );

      await expect(
        bus.publish(new StubEvent('tenant-1', 'corr-1', { value: 'x' })),
      ).resolves.toBeUndefined();
    });
  });

  describe('delegation to the inner Pub/Sub adapter', () => {
    it('subscribe() delegates', () => {
      const bus = new OutboxEventBus(repo, innerBus, relay, makeConfigService());
      const handler = jest.fn();
      bus.subscribe('SomeEvent', handler, 'some-consumer');
      expect(innerBus.subscribe).toHaveBeenCalledWith('SomeEvent', handler, 'some-consumer');
    });

    it('registerTrigger() delegates', () => {
      const bus = new OutboxEventBus(repo, innerBus, relay, makeConfigService());
      const handler = jest.fn();
      bus.registerTrigger('cron-x', handler, 'consumer-x');
      expect(innerBus.registerTrigger).toHaveBeenCalledWith('cron-x', handler, 'consumer-x');
    });

    it('publishTrigger() delegates', async () => {
      const bus = new OutboxEventBus(repo, innerBus, relay, makeConfigService());
      await bus.publishTrigger('cron-x');
      expect(innerBus.publishTrigger).toHaveBeenCalledWith('cron-x');
    });

    it('dispatchPushMessage() delegates', async () => {
      const bus = new OutboxEventBus(repo, innerBus, relay, makeConfigService());
      await bus.dispatchPushMessage('projects/p/subscriptions/s', 'base64data');
      expect(innerBus.dispatchPushMessage).toHaveBeenCalledWith(
        'projects/p/subscriptions/s',
        'base64data',
      );
    });
  });
});
