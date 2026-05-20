import { DomainEvent } from '../domain/domain-event';

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

class StubEvent extends DomainEvent<{ value: string }> {
  readonly eventName = 'StubEvent';
  readonly eventVersion = 1;
  readonly data: { value: string };
  constructor(data: { value: string }) {
    super('tenant-1', 'corr-1');
    this.data = data;
  }
}

const noopHandler = async (_e: DomainEvent): Promise<void> => {
  /* test stub */
};

describe('GcpPubSubEventBusAdapter', () => {
  let adapter: GcpPubSubEventBusAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new GcpPubSubEventBusAdapter();
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
      expect(parsed.eventName).toBe('StubEvent');
      expect(call.attributes.eventName).toBe('StubEvent');
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
      expect(mockCreateTopic).toHaveBeenCalledWith('beloauto-StubEvent');
    });
  });

  describe('subscribe() + onApplicationBootstrap()', () => {
    it('registers subscription and starts listener on bootstrap', async () => {
      adapter.subscribe('StubEvent', noopHandler, 'test-consumer');
      await adapter.onApplicationBootstrap();

      expect(mockSubOn).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockSubOn).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('creates subscription when it does not exist', async () => {
      mockSubscriptionExists.mockResolvedValueOnce([false]);
      adapter.subscribe('StubEvent', noopHandler, 'test-consumer');
      await adapter.onApplicationBootstrap();

      expect(mockCreateSubscription).toHaveBeenCalledWith('beloauto-StubEvent-test-consumer');
    });
  });

  describe('onModuleDestroy()', () => {
    it('closes all active subscriptions', async () => {
      adapter.subscribe('StubEvent', noopHandler, 'test-consumer');
      await adapter.onApplicationBootstrap();
      await adapter.onModuleDestroy();

      expect(mockSubClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('message dispatch', () => {
    it('acks message when handler succeeds', async () => {
      adapter.subscribe('StubEvent', noopHandler, 'test-consumer');
      await adapter.onApplicationBootstrap();

      const messageHandler = mockSubOn.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )?.[1] as (msg: unknown) => void;

      const event = new StubEvent({ value: 'x' });
      const fakeMessage = {
        data: Buffer.from(JSON.stringify(event)),
        ack: mockAck,
        nack: mockNack,
      };
      messageHandler(fakeMessage);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockAck).toHaveBeenCalledTimes(1);
      expect(mockNack).not.toHaveBeenCalled();
    });

    it('nacks message when handler throws', async () => {
      const throwingHandler = async (_e: DomainEvent): Promise<void> => {
        throw new Error('boom');
      };
      adapter.subscribe('StubEvent', throwingHandler, 'test-consumer');
      await adapter.onApplicationBootstrap();

      const messageHandler = mockSubOn.mock.calls.find(
        (c: unknown[]) => c[0] === 'message',
      )?.[1] as (msg: unknown) => void;

      const event = new StubEvent({ value: 'x' });
      const fakeMessage = {
        data: Buffer.from(JSON.stringify(event)),
        ack: mockAck,
        nack: mockNack,
      };
      messageHandler(fakeMessage);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockNack).toHaveBeenCalledTimes(1);
      expect(mockAck).not.toHaveBeenCalled();
    });
  });
});
