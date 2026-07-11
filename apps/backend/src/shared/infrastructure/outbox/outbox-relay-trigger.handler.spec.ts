import { InMemoryEventBus } from '../../../test/infrastructure/in-memory-event-bus';
import { CRON_OUTBOX_RELAY_TRIGGER } from './cron-outbox-relay.constants';
import { OutboxRelayTriggerHandler } from './outbox-relay-trigger.handler';
import { OutboxRelayService } from './outbox-relay.service';

describe('OutboxRelayTriggerHandler', () => {
  let handler: OutboxRelayTriggerHandler;
  let relay: jest.Mocked<OutboxRelayService>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    relay = {
      relay: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OutboxRelayService>;
    triggerBus = new InMemoryEventBus();
    handler = new OutboxRelayTriggerHandler(relay, triggerBus);
  });

  it('registers the cron-outbox-relay trigger with the outbox-relay consumer name on init', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');
    handler.onModuleInit();
    expect(spy).toHaveBeenCalledWith(
      CRON_OUTBOX_RELAY_TRIGGER,
      expect.any(Function),
      OutboxRelayTriggerHandler.CONSUMER_NAME,
    );
  });

  it('delegates to OutboxRelayService.relay() with no rowIds (full sweep + GC)', async () => {
    await handler.handle();
    expect(relay.relay).toHaveBeenCalledTimes(1);
    expect(relay.relay).toHaveBeenCalledWith();
  });

  it('rethrows when the relay fails', async () => {
    relay.relay.mockRejectedValue(new Error('boom'));
    await expect(handler.handle()).rejects.toThrow('boom');
  });
});
