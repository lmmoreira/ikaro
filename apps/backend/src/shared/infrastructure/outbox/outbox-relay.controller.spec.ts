import { InMemoryEventBus } from '../../../test/infrastructure/in-memory-event-bus';
import { CRON_OUTBOX_RELAY_TRIGGER } from './cron-outbox-relay.constants';
import { OutboxRelayController } from './outbox-relay.controller';

describe('OutboxRelayController', () => {
  let controller: OutboxRelayController;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    triggerBus = new InMemoryEventBus();
    controller = new OutboxRelayController(triggerBus);
  });

  it('returns { ok: true }', async () => {
    const result = await controller.outboxRelay();
    expect(result).toEqual({ ok: true });
  });

  it('publishes the cron-outbox-relay trigger', async () => {
    await controller.outboxRelay();
    expect(triggerBus.publishedTriggers).toEqual([CRON_OUTBOX_RELAY_TRIGGER]);
  });
});
