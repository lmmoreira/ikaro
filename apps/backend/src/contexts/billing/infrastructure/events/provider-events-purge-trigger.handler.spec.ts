import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import type { PurgeProviderEventsUseCase } from '../../application/use-cases/purge-provider-events.use-case';
import { CRON_BILLING_PROVIDER_EVENTS_PURGE_TRIGGER } from './cron-trigger-names.constants';
import { ProviderEventsPurgeTriggerHandler } from './provider-events-purge-trigger.handler';

describe('ProviderEventsPurgeTriggerHandler', () => {
  let handler: ProviderEventsPurgeTriggerHandler;
  let useCase: jest.Mocked<Pick<PurgeProviderEventsUseCase, 'execute'>>;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ deleted: 0, batches: 1, limitHit: false }) };
    triggerBus = new InMemoryEventBus();
    handler = new ProviderEventsPurgeTriggerHandler(useCase, triggerBus);
  });

  it('registers cron-billing-provider-events-purge with the billing-provider-events-purge consumer on init', () => {
    const spy = jest.spyOn(triggerBus, 'registerTrigger');

    handler.onModuleInit();

    expect(spy).toHaveBeenCalledWith(
      CRON_BILLING_PROVIDER_EVENTS_PURGE_TRIGGER,
      expect.any(Function),
      ProviderEventsPurgeTriggerHandler.CONSUMER_NAME,
    );
    expect(ProviderEventsPurgeTriggerHandler.CONSUMER_NAME).toBe('billing-provider-events-purge');
  });

  it('the registered callback runs the use case, and a failed run propagates so the message is nacked', async () => {
    let registered: (() => Promise<void>) | undefined;
    jest.spyOn(triggerBus, 'registerTrigger').mockImplementation((_name, callback) => {
      registered = callback;
    });
    handler.onModuleInit();

    await registered?.();
    expect(useCase.execute).toHaveBeenCalledTimes(1);

    useCase.execute.mockRejectedValue(new Error('boom'));
    await expect(registered?.()).rejects.toThrow('boom');
  });

  it('calls the one use case with a fresh correlation id for each run and nothing else', async () => {
    await handler.handle();
    await handler.handle();

    const [first, second] = useCase.execute.mock.calls.map(([input]) => input);
    expect(Object.keys(first)).toEqual(['correlationId']);
    expect(first.correlationId).not.toBe(second.correlationId);
  });
});
