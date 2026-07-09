import { HttpException } from '@nestjs/common';
import { PubSubPushController } from './pubsub-push.controller';
import { GcpPubSubEventBusAdapter } from './gcp-pubsub-event-bus.adapter';

describe('PubSubPushController', () => {
  let controller: PubSubPushController;
  let eventBus: jest.Mocked<Pick<GcpPubSubEventBusAdapter, 'dispatchPushMessage'>>;

  beforeEach(() => {
    eventBus = { dispatchPushMessage: jest.fn().mockResolvedValue(undefined) };
    controller = new PubSubPushController(eventBus as unknown as GcpPubSubEventBusAdapter);
  });

  it('forwards the subscription and base64 data to the adapter', async () => {
    await controller.push({
      message: { data: 'base64-payload', messageId: 'm-1', attributes: {} },
      subscription: 'projects/ikaro-local/subscriptions/ikaro-StubEvent-test-consumer',
    });

    expect(eventBus.dispatchPushMessage).toHaveBeenCalledWith(
      'projects/ikaro-local/subscriptions/ikaro-StubEvent-test-consumer',
      'base64-payload',
    );
  });

  it('resolves with no content when dispatch succeeds', async () => {
    await expect(
      controller.push({
        message: { data: 'x', messageId: 'm-2', attributes: {} },
        subscription: 'sub',
      }),
    ).resolves.toBeUndefined();
  });

  it('rethrows as a 500 Problem Detail when the adapter throws, so Pub/Sub redelivers', async () => {
    eventBus.dispatchPushMessage.mockRejectedValueOnce(new Error('handler boom'));

    try {
      await controller.push({
        message: { data: 'x', messageId: 'm-3', attributes: {} },
        subscription: 'sub',
      });
      fail('expected HttpException');
    } catch (e) {
      const exception = e as HttpException;
      expect(exception.getStatus()).toBe(500);
      const body = exception.getResponse() as Record<string, unknown>;
      expect(body['type']).toBe('about:blank');
      expect(body['status']).toBe(500);
      expect(body['detail']).toBe('handler boom');
    }
  });
});
