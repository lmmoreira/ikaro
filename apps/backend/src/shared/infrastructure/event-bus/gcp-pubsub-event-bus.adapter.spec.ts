import { ConfigService } from '@nestjs/config';
import { ITracingPort } from '@ikaro/observability';
import { DomainEvent } from '../../domain/domain-event';
import { StubEvent as SharedStubEvent } from '../../../test/infrastructure/stub-envelope-classes';

const mockAck = jest.fn();
const mockNack = jest.fn();
const mockPublishMessage = jest.fn().mockResolvedValue('msg-id');
const mockTopicExists = jest.fn().mockResolvedValue([true]);
const mockSubscriptionExists = jest.fn().mockResolvedValue([true]);
const mockCreateSubscription = jest.fn().mockResolvedValue([{}]);
const mockCreateTopic = jest.fn().mockResolvedValue([{}]);
const mockSubOn = jest.fn();
const mockSubClose = jest.fn().mockResolvedValue(undefined);

jest.mock('@google-cloud/pubsub', () => ({
  PubSub: jest.fn().mockImplementation(() => ({
    topic: jest.fn().mockReturnValue({
      exists: mockTopicExists,
      publishMessage: mockPublishMessage,
      subscription: jest.fn().mockReturnValue({
        exists: mockSubscriptionExists,
        createSubscription: mockCreateSubscription,
      }),
      createSubscription: mockCreateSubscription,
    }),
    subscription: jest.fn().mockReturnValue({
      on: mockSubOn,
      close: mockSubClose,
    }),
    createTopic: mockCreateTopic,
  })),
}));

import { GcpPubSubEventBusAdapter } from './gcp-pubsub-event-bus.adapter';

// Fixed tenantId/correlationId convenience wrapper over the shared stub (bad-smell-audit BE-3) —
// this file's ~11 call sites only ever need to vary `data`, so this keeps them single-arg
// (new StubEvent({ value })) instead of repeating 'tenant-1'/'corr-1' at every call site.
class StubEvent extends SharedStubEvent {
  constructor(data: { value: string }) {
    super('tenant-1', 'corr-1', data);
  }
}

const noopHandler = async (_e: DomainEvent): Promise<void> => {
  /* test stub */
};

// Records the span name it was asked to start instead of talking to real OTel primitives — this
// suite only needs to prove dispatchPushMessage() wraps the handler call in a named span (TD28);
// the span's own success/error/end behavior is covered by
// packages/observability/src/otel-tracing-adapter.spec.ts.
class FakeTracingPort implements ITracingPort {
  readonly startedSpans: string[] = [];
  readonly extractedCarriers: Array<Record<string, string>> = [];
  setActiveSpanAttributes(): void {
    /* unused by this suite */
  }
  getActiveTraceContext(): undefined {
    return undefined;
  }
  injectContext(): void {
    /* unused by this suite */
  }
  runWithExtractedContext<T>(carrier: Record<string, string>, fn: () => T): T {
    this.extractedCarriers.push(carrier);
    return fn();
  }
  startActiveSpan<T>(name: string, fn: () => T): T {
    this.startedSpans.push(name);
    return fn();
  }
}

const noopTriggerHandler = async (): Promise<void> => {
  /* test stub */
};

function makeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    getOrThrow: (key: string): string => {
      if (key === 'PUBSUB_PROJECT_ID') return 'ikaro-local';
      throw new Error(`Unknown config key: ${key}`);
    },
    get: (key: string, defaultValue?: unknown): unknown => {
      if (key === 'PUBSUB_SUBSCRIPTION_SUFFIX') return overrides[key] ?? defaultValue ?? '';
      if (key === 'PUBSUB_MAX_DELIVERY_ATTEMPTS') return overrides[key] ?? defaultValue ?? 5;
      if (key === 'PUBSUB_AUTO_CREATE') return overrides[key] ?? defaultValue ?? true;
      if (key === 'PUBSUB_CONSUMER_MODE') return overrides[key] ?? defaultValue ?? 'pull';
      throw new Error(`Unknown config key: ${key}`);
    },
  } as unknown as ConfigService;
}

describe('GcpPubSubEventBusAdapter', () => {
  let adapter: GcpPubSubEventBusAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new GcpPubSubEventBusAdapter(makeConfigService());
  });

  describe('publish()', () => {
    it('ensures topic exists then publishes serialised event', async () => {
      const event = new StubEvent({ value: 'hello' });
      await adapter.publish(event);

      expect(mockTopicExists).toHaveBeenCalledTimes(1);
      expect(mockPublishMessage).toHaveBeenCalledTimes(1);
      const call = mockPublishMessage.mock.calls[0][0] as {
        data: Buffer;
        attributes: Record<string, string>;
      };
      const parsed = JSON.parse(call.data.toString()) as StubEvent;
      expect(parsed.eventName).toBe(StubEvent.name);
      expect(call.attributes.eventName).toBe(StubEvent.name);
    });

    it('skips topic.exists() on the second publish to the same topic', async () => {
      const event = new StubEvent({ value: 'x' });
      await adapter.publish(event);
      await adapter.publish(event);

      expect(mockTopicExists).toHaveBeenCalledTimes(1);
      expect(mockPublishMessage).toHaveBeenCalledTimes(2);
    });

    it('creates the topic when it does not exist', async () => {
      mockTopicExists.mockResolvedValueOnce([false]);
      await adapter.publish(new StubEvent({ value: 'x' }));
      expect(mockCreateTopic).toHaveBeenCalledWith('ikaro-StubEvent');
    });

    it('forwards event.traceContext into the published message attributes (TD28)', async () => {
      const event = new StubEvent({ value: 'x' });
      event.traceContext = { traceparent: '00-abc-def-01' };

      await adapter.publish(event);

      const call = mockPublishMessage.mock.calls[0][0] as { attributes: Record<string, string> };
      expect(call.attributes['traceparent']).toBe('00-abc-def-01');
      expect(call.attributes.eventName).toBe(StubEvent.name);
      expect(call.attributes.tenantId).toBe('tenant-1');
    });

    it('publishes with no extra attributes when the event has no traceContext', async () => {
      const event = new StubEvent({ value: 'x' });

      await adapter.publish(event);

      const call = mockPublishMessage.mock.calls[0][0] as { attributes: Record<string, string> };
      expect(Object.keys(call.attributes)).toEqual(['eventName', 'tenantId']);
    });
  });

  describe('subscribe() + onApplicationBootstrap()', () => {
    it('registers subscription and starts listener on bootstrap', async () => {
      adapter.subscribe(StubEvent.name, noopHandler, 'test-consumer');
      await adapter.onApplicationBootstrap();

      expect(mockSubOn).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockSubOn).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('creates subscription when it does not exist', async () => {
      mockSubscriptionExists.mockResolvedValueOnce([false]);
      adapter.subscribe(StubEvent.name, noopHandler, 'test-consumer');
      await adapter.onApplicationBootstrap();

      expect(mockCreateSubscription).toHaveBeenCalledWith('ikaro-StubEvent-test-consumer');
    });

    it('registers separate subscriptions for two consumers on the same event', async () => {
      adapter.subscribe(StubEvent.name, noopHandler, 'consumer-a');
      adapter.subscribe(StubEvent.name, noopHandler, 'consumer-b');
      await adapter.onApplicationBootstrap();

      // Each subscription registers 'message' and 'error' handlers (2 × 2 = 4 calls)
      expect(mockSubOn).toHaveBeenCalledTimes(4);
      expect(mockSubOn).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockSubOn).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('onModuleDestroy()', () => {
    it('closes all active subscriptions', async () => {
      adapter.subscribe(StubEvent.name, noopHandler, 'test-consumer');
      await adapter.onApplicationBootstrap();
      await adapter.onModuleDestroy();

      expect(mockSubClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('message dispatch', () => {
    it('acks message when handler succeeds', async () => {
      adapter.subscribe(StubEvent.name, noopHandler, 'test-consumer');
      await adapter.onApplicationBootstrap();

      const messageHandler = mockSubOn.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )?.[1] as (msg: unknown) => void;

      const event = new StubEvent({ value: 'x' });
      const fakeMessage = {
        data: Buffer.from(JSON.stringify(event)),
        ack: mockAck,
        nack: mockNack,
        deliveryAttempt: 1,
        attributes: {},
      };
      messageHandler(fakeMessage);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockAck).toHaveBeenCalledTimes(1);
      expect(mockNack).not.toHaveBeenCalled();
    });

    it('wraps the handler call in a named span extracted from message.attributes (TD28, pull mode)', async () => {
      const tracingPort = new FakeTracingPort();
      adapter = new GcpPubSubEventBusAdapter(makeConfigService(), tracingPort);
      const handlerSpy = jest.fn().mockResolvedValue(undefined);
      adapter.subscribe(StubEvent.name, handlerSpy, 'test-consumer');
      await adapter.onApplicationBootstrap();

      const messageHandler = mockSubOn.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )?.[1] as (msg: unknown) => void;

      const fakeMessage = {
        data: Buffer.from(JSON.stringify(new StubEvent({ value: 'x' }))),
        ack: mockAck,
        nack: mockNack,
        deliveryAttempt: 1,
        attributes: { traceparent: '00-abc-def-01' },
      };
      messageHandler(fakeMessage);
      await new Promise((r) => setTimeout(r, 10));

      expect(tracingPort.extractedCarriers).toEqual([{ traceparent: '00-abc-def-01' }]);
      expect(tracingPort.startedSpans).toEqual([`pubsub.event.${StubEvent.name}`]);
      expect(handlerSpy).toHaveBeenCalledTimes(1);
    });

    it('nacks message when handler throws and attempt is below threshold', async () => {
      const throwingHandler = async (_e: DomainEvent): Promise<void> => {
        throw new Error('boom');
      };
      adapter.subscribe(StubEvent.name, throwingHandler, 'test-consumer');
      await adapter.onApplicationBootstrap();

      const messageHandler = mockSubOn.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )?.[1] as (msg: unknown) => void;

      const event = new StubEvent({ value: 'x' });
      const fakeMessage = {
        data: Buffer.from(JSON.stringify(event)),
        ack: mockAck,
        nack: mockNack,
        deliveryAttempt: 1, // below threshold of 5
        attributes: {},
      };
      messageHandler(fakeMessage);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockNack).toHaveBeenCalledTimes(1);
      expect(mockAck).not.toHaveBeenCalled();
      expect(mockPublishMessage).not.toHaveBeenCalled();
    });

    it('routes to DLQ and acks when handler throws at PUBSUB_MAX_DELIVERY_ATTEMPTS', async () => {
      const throwingHandler = async (_e: DomainEvent): Promise<void> => {
        throw new Error('persistent failure');
      };
      adapter.subscribe(StubEvent.name, throwingHandler, 'test-consumer');
      await adapter.onApplicationBootstrap();

      const messageHandler = mockSubOn.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )?.[1] as (msg: unknown) => void;

      const event = new StubEvent({ value: 'x' });
      const fakeMessage = {
        data: Buffer.from(JSON.stringify(event)),
        ack: mockAck,
        nack: mockNack,
        deliveryAttempt: 5, // at threshold
        attributes: { eventName: StubEvent.name },
      };
      messageHandler(fakeMessage);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockPublishMessage).toHaveBeenCalledTimes(1);
      const dlqCall = mockPublishMessage.mock.calls[0][0] as {
        data: Buffer;
        attributes: Record<string, string>;
      };
      const dlqPayload = JSON.parse(dlqCall.data.toString()) as Record<string, unknown>;
      expect(dlqPayload['deadLetterReason']).toBe('persistent failure');
      expect(dlqPayload['deliveryAttempt']).toBe(5);
      expect(mockAck).toHaveBeenCalledTimes(1);
      expect(mockNack).not.toHaveBeenCalled();
    });

    it('acks and logs unparseable message without invoking handler', async () => {
      const handlerSpy = jest.fn();
      adapter.subscribe(StubEvent.name, handlerSpy, 'test-consumer');
      await adapter.onApplicationBootstrap();

      const messageHandler = mockSubOn.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )?.[1] as (msg: unknown) => void;

      const fakeMessage = {
        data: Buffer.from('not-valid-json'),
        ack: mockAck,
        nack: mockNack,
        deliveryAttempt: 1,
        attributes: {},
      };
      messageHandler(fakeMessage);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockAck).toHaveBeenCalledTimes(1);
      expect(mockNack).not.toHaveBeenCalled();
      expect(handlerSpy).not.toHaveBeenCalled();
    });
  });

  describe('PUBSUB_AUTO_CREATE=false', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      adapter = new GcpPubSubEventBusAdapter(makeConfigService({ PUBSUB_AUTO_CREATE: false }));
    });

    it('skips topic creation on publish when PUBSUB_AUTO_CREATE is false', async () => {
      const event = new StubEvent({ value: 'x' });
      await adapter.publish(event);

      expect(mockTopicExists).not.toHaveBeenCalled();
      expect(mockCreateTopic).not.toHaveBeenCalled();
      expect(mockPublishMessage).toHaveBeenCalledTimes(1);
    });

    it('skips subscription creation on bootstrap when PUBSUB_AUTO_CREATE is false', async () => {
      adapter.subscribe(StubEvent.name, noopHandler, 'test-consumer');
      await adapter.onApplicationBootstrap();

      expect(mockTopicExists).not.toHaveBeenCalled();
      expect(mockSubscriptionExists).not.toHaveBeenCalled();
      expect(mockCreateSubscription).not.toHaveBeenCalled();
    });
  });

  describe('PUBSUB_CONSUMER_MODE=push', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      adapter = new GcpPubSubEventBusAdapter(
        makeConfigService({ PUBSUB_CONSUMER_MODE: 'push', PUBSUB_AUTO_CREATE: false }),
      );
    });

    it('does not open any streaming-pull subscription on bootstrap', async () => {
      adapter.subscribe(StubEvent.name, noopHandler, 'test-consumer');
      await adapter.onApplicationBootstrap();

      expect(mockSubOn).not.toHaveBeenCalled();
      expect(mockSubscriptionExists).not.toHaveBeenCalled();
    });

    describe('dispatchPushMessage()', () => {
      it('routes to the handler registered for the subscription, stripping the full-name prefix', async () => {
        const handlerSpy = jest.fn().mockResolvedValue(undefined);
        adapter.subscribe(StubEvent.name, handlerSpy, 'test-consumer');
        await adapter.onApplicationBootstrap();

        const event = new StubEvent({ value: 'x' });
        const base64Data = Buffer.from(JSON.stringify(event)).toString('base64');

        await adapter.dispatchPushMessage(
          'projects/ikaro-local/subscriptions/ikaro-StubEvent-test-consumer',
          base64Data,
        );

        expect(handlerSpy).toHaveBeenCalledTimes(1);
        const received = handlerSpy.mock.calls[0][0] as StubEvent;
        expect(received.eventName).toBe(StubEvent.name);
        expect(received.data.value).toBe('x');
      });

      it('wraps the domain-event handler call in a named span (TD28)', async () => {
        const tracingPort = new FakeTracingPort();
        adapter = new GcpPubSubEventBusAdapter(
          makeConfigService({ PUBSUB_CONSUMER_MODE: 'push', PUBSUB_AUTO_CREATE: false }),
          tracingPort,
        );
        const handlerSpy = jest.fn().mockResolvedValue(undefined);
        adapter.subscribe(StubEvent.name, handlerSpy, 'test-consumer');
        await adapter.onApplicationBootstrap();

        const base64Data = Buffer.from(JSON.stringify(new StubEvent({ value: 'x' }))).toString(
          'base64',
        );
        await adapter.dispatchPushMessage(
          'projects/ikaro-local/subscriptions/ikaro-StubEvent-test-consumer',
          base64Data,
        );

        expect(tracingPort.startedSpans).toEqual([`pubsub.event.${StubEvent.name}`]);
        expect(handlerSpy).toHaveBeenCalledTimes(1);
      });

      it('does not wrap the trigger handler call in a span — cron triggers are out of TD28 scope', async () => {
        const tracingPort = new FakeTracingPort();
        adapter = new GcpPubSubEventBusAdapter(
          makeConfigService({ PUBSUB_CONSUMER_MODE: 'push', PUBSUB_AUTO_CREATE: false }),
          tracingPort,
        );
        const triggerSpy = jest.fn().mockResolvedValue(undefined);
        adapter.registerTrigger('cron-reminders', triggerSpy, 'booking-reminder');
        await adapter.onApplicationBootstrap();

        await adapter.dispatchPushMessage(
          'projects/ikaro-local/subscriptions/ikaro-cron-reminders-booking-reminder',
          Buffer.from('{}').toString('base64'),
        );

        expect(tracingPort.startedSpans).toEqual([]);
        expect(triggerSpy).toHaveBeenCalledTimes(1);
      });

      it('rethrows when the handler fails, so the controller can respond 5xx', async () => {
        const throwingHandler = async (): Promise<void> => {
          throw new Error('handler boom');
        };
        adapter.subscribe(StubEvent.name, throwingHandler, 'test-consumer');
        await adapter.onApplicationBootstrap();

        const base64Data = Buffer.from(JSON.stringify(new StubEvent({ value: 'x' }))).toString(
          'base64',
        );

        await expect(
          adapter.dispatchPushMessage('ikaro-StubEvent-test-consumer', base64Data),
        ).rejects.toThrow('handler boom');
      });

      it('does not throw for an unregistered subscription name', async () => {
        await expect(
          adapter.dispatchPushMessage(
            'ikaro-Unknown-consumer',
            Buffer.from('{}').toString('base64'),
          ),
        ).resolves.toBeUndefined();
      });

      it('does not throw for an unparseable payload', async () => {
        const handlerSpy = jest.fn();
        adapter.subscribe(StubEvent.name, handlerSpy, 'test-consumer');
        await adapter.onApplicationBootstrap();

        await expect(
          adapter.dispatchPushMessage(
            'ikaro-StubEvent-test-consumer',
            Buffer.from('not-valid-json').toString('base64'),
          ),
        ).resolves.toBeUndefined();
        expect(handlerSpy).not.toHaveBeenCalled();
      });

      it('routes to the trigger handler registered for the subscription, ahead of the DomainEvent path', async () => {
        const triggerSpy = jest.fn().mockResolvedValue(undefined);
        adapter.registerTrigger('cron-reminders', triggerSpy, 'booking-reminder');
        await adapter.onApplicationBootstrap();

        await adapter.dispatchPushMessage(
          'projects/ikaro-local/subscriptions/ikaro-cron-reminders-booking-reminder',
          Buffer.from('{}').toString('base64'),
        );

        expect(triggerSpy).toHaveBeenCalledTimes(1);
        expect(triggerSpy).toHaveBeenCalledWith();
      });

      it('rethrows when the trigger handler fails, so the controller can respond 5xx', async () => {
        const throwingTrigger = async (): Promise<void> => {
          throw new Error('trigger boom');
        };
        adapter.registerTrigger('cron-reminders', throwingTrigger, 'booking-reminder');
        await adapter.onApplicationBootstrap();

        await expect(
          adapter.dispatchPushMessage('ikaro-cron-reminders-booking-reminder', ''),
        ).rejects.toThrow('trigger boom');
      });
    });
  });

  describe('registerTrigger() + publishTrigger()', () => {
    it('publishes an empty payload to the trigger topic', async () => {
      await adapter.publishTrigger('cron-reminders');

      expect(mockTopicExists).toHaveBeenCalledTimes(1);
      expect(mockPublishMessage).toHaveBeenCalledTimes(1);
      const call = mockPublishMessage.mock.calls[0][0] as { data: Buffer };
      expect(call.data.toString()).toBe('{}');
    });

    it('registers separate subscriptions for two consumers of the same trigger', async () => {
      adapter.registerTrigger('cron-reminders', noopTriggerHandler, 'booking-reminder');
      adapter.registerTrigger(
        'cron-reminders',
        noopTriggerHandler,
        'booking-admin-schedule-reminder',
      );
      await adapter.onApplicationBootstrap();

      expect(mockCreateSubscription).not.toHaveBeenCalled(); // subscriptions already "exist" per mock
      // Each subscription registers 'message' and 'error' handlers (2 × 2 = 4 calls)
      expect(mockSubOn).toHaveBeenCalledTimes(4);
    });

    it('one consumer failing does not prevent the other consumer of the same trigger from acking (isolation)', async () => {
      const throwingHandler = async (): Promise<void> => {
        throw new Error('boom');
      };
      const succeedingHandler = jest.fn().mockResolvedValue(undefined);
      adapter.registerTrigger('cron-reminders', throwingHandler, 'booking-reminder');
      adapter.registerTrigger(
        'cron-reminders',
        succeedingHandler,
        'booking-admin-schedule-reminder',
      );
      await adapter.onApplicationBootstrap();

      const messageHandlers = mockSubOn.mock.calls
        .filter((c: unknown[]) => c[0] === 'message')
        .map((c: unknown[]) => c[1] as (msg: unknown) => void);
      expect(messageHandlers).toHaveLength(2);

      const failingAck = jest.fn();
      const failingNack = jest.fn();
      const succeedingAck = jest.fn();
      const succeedingNack = jest.fn();
      messageHandlers[0]({ ack: failingAck, nack: failingNack, deliveryAttempt: 1 });
      messageHandlers[1]({ ack: succeedingAck, nack: succeedingNack, deliveryAttempt: 1 });
      await Promise.resolve();
      await Promise.resolve();

      expect(failingNack).toHaveBeenCalledTimes(1);
      expect(failingAck).not.toHaveBeenCalled();
      expect(succeedingHandler).toHaveBeenCalledTimes(1);
      expect(succeedingAck).toHaveBeenCalledTimes(1);
      expect(succeedingNack).not.toHaveBeenCalled();
    });

    it('acks the pull message when the trigger handler succeeds', async () => {
      adapter.registerTrigger('cron-reminders', noopTriggerHandler, 'booking-reminder');
      await adapter.onApplicationBootstrap();

      const messageHandler = mockSubOn.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )?.[1] as (msg: unknown) => void;

      messageHandler({ ack: mockAck, nack: mockNack, deliveryAttempt: 1 });
      await Promise.resolve();
      await Promise.resolve();

      expect(mockAck).toHaveBeenCalledTimes(1);
      expect(mockNack).not.toHaveBeenCalled();
    });

    it('nacks the pull message when the trigger handler throws below the retry threshold', async () => {
      const throwingTrigger = async (): Promise<void> => {
        throw new Error('boom');
      };
      adapter.registerTrigger('cron-reminders', throwingTrigger, 'booking-reminder');
      await adapter.onApplicationBootstrap();

      const messageHandler = mockSubOn.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )?.[1] as (msg: unknown) => void;

      messageHandler({ ack: mockAck, nack: mockNack, deliveryAttempt: 1 });
      await Promise.resolve();
      await Promise.resolve();

      expect(mockNack).toHaveBeenCalledTimes(1);
      expect(mockAck).not.toHaveBeenCalled();
    });

    it('acks (drops, no DLQ) when the trigger handler throws at the retry threshold', async () => {
      const throwingTrigger = async (): Promise<void> => {
        throw new Error('persistent failure');
      };
      adapter.registerTrigger('cron-reminders', throwingTrigger, 'booking-reminder');
      await adapter.onApplicationBootstrap();

      const messageHandler = mockSubOn.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )?.[1] as (msg: unknown) => void;

      messageHandler({ ack: mockAck, nack: mockNack, deliveryAttempt: 5 });
      await Promise.resolve();
      await Promise.resolve();

      expect(mockAck).toHaveBeenCalledTimes(1);
      expect(mockNack).not.toHaveBeenCalled();
      expect(mockPublishMessage).not.toHaveBeenCalled(); // no DLQ publish for triggers
    });
  });
});
