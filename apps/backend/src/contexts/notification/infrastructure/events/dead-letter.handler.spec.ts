import { DomainEvent } from '../../../../shared/domain/domain-event';
import { DEAD_LETTER_CHANNEL_NAME } from '../../../../shared/infrastructure/event-bus/dead-letter-channel.constant';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { DeadLetterHandler } from './dead-letter.handler';

// The DLQ payload's own eventName is the ORIGINAL failed event's name (e.g. "BookingRequested")
// — DEAD_LETTER_CHANNEL_NAME is the subscription/channel name, a different concept that happens
// to be unrelated to what actually failed (CodeRabbit review, PR #375).
class StubDeadLetterEvent extends DomainEvent<Record<string, never>> {
  readonly eventName = 'BookingRequested';
  readonly eventVersion = 1;
  readonly data: Record<string, never> = {};
  readonly deliveryAttempt?: number;
  readonly deadLetterReason?: string;

  constructor(
    tenantId: string,
    correlationId: string,
    opts: { deliveryAttempt?: number; deadLetterReason?: string } = {},
  ) {
    super(tenantId, correlationId);
    this.deliveryAttempt = opts.deliveryAttempt;
    this.deadLetterReason = opts.deadLetterReason;
  }
}

describe('DeadLetterHandler', () => {
  let handler: DeadLetterHandler;
  let eventBus: InMemoryEventBus;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    handler = new DeadLetterHandler(eventBus);

    loggerErrorSpy = jest
      .spyOn(
        (handler as unknown as { logger: { error: (...args: unknown[]) => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('onModuleInit()', () => {
    it('subscribes to dead-letter event with consumer name monitor', () => {
      const subscribeSpy = jest.spyOn(eventBus, 'subscribe');
      handler.onModuleInit();
      expect(subscribeSpy).toHaveBeenCalledWith(
        DEAD_LETTER_CHANNEL_NAME,
        expect.any(Function),
        'monitor',
      );
    });
  });

  describe('handle()', () => {
    it('logs at ERROR level with all required context fields', async () => {
      const event = new StubDeadLetterEvent('tenant-123', 'corr-abc', {
        deadLetterReason: 'handler crashed',
        deliveryAttempt: 5,
      });

      await handler.handle(event);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Dead-letter message received — requires human investigation',
        undefined,
        expect.objectContaining({
          eventId: event.eventId,
          eventName: 'BookingRequested',
          tenantId: 'tenant-123',
          deliveryAttempt: 5,
          deadLetterReason: 'handler crashed',
        }),
      );
    });

    it('does not throw — handler must always complete so adapter can ACK', async () => {
      const event = new StubDeadLetterEvent('tenant-123', 'corr-abc');
      await expect(handler.handle(event)).resolves.toBeUndefined();
    });

    it('logs undefined for deadLetterReason and deliveryAttempt when not present in event', async () => {
      const event = new StubDeadLetterEvent('tenant-123', 'corr-abc');

      await handler.handle(event);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Dead-letter message received — requires human investigation',
        undefined,
        expect.objectContaining({
          deadLetterReason: undefined,
          deliveryAttempt: undefined,
        }),
      );
    });
  });
});
