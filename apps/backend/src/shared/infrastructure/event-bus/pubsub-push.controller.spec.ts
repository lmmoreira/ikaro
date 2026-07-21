import { HttpException } from '@nestjs/common';
import { ITracingPort } from '@ikaro/observability';
import { PubSubPushController } from './pubsub-push.controller';
import { IPushableEventBus } from '../../ports/pushable-event-bus.port';

// Records what it was called with instead of talking to real OTel primitives — this suite only
// needs to prove the controller wires the extracted carrier through, not that extraction itself
// links spans correctly (that's covered by packages/observability/src/otel-tracing-adapter.spec.ts).
class FakeTracingPort implements ITracingPort {
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
}

describe('PubSubPushController', () => {
  let controller: PubSubPushController;
  let eventBus: jest.Mocked<IPushableEventBus>;
  let tracingPort: FakeTracingPort;

  beforeEach(() => {
    eventBus = { dispatchPushMessage: jest.fn().mockResolvedValue(undefined) };
    tracingPort = new FakeTracingPort();
    controller = new PubSubPushController(eventBus, tracingPort);
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

  it('acks instead of dispatching when message.data is missing (malformed envelope)', async () => {
    await expect(
      controller.push({
        message: { messageId: 'm-4', attributes: {} } as unknown as {
          data: string;
          messageId: string;
        },
        subscription: 'sub',
      }),
    ).resolves.toBeUndefined();
    expect(eventBus.dispatchPushMessage).not.toHaveBeenCalled();
  });

  it('acks instead of dispatching when message is missing entirely (malformed envelope)', async () => {
    await expect(
      controller.push({ subscription: 'sub' } as unknown as Parameters<typeof controller.push>[0]),
    ).resolves.toBeUndefined();
    expect(eventBus.dispatchPushMessage).not.toHaveBeenCalled();
  });

  it('acks instead of dispatching when subscription is missing (malformed envelope)', async () => {
    await expect(
      controller.push({
        message: { data: 'x', messageId: 'm-5', attributes: {} },
      } as unknown as Parameters<typeof controller.push>[0]),
    ).resolves.toBeUndefined();
    expect(eventBus.dispatchPushMessage).not.toHaveBeenCalled();
  });

  describe('trace context propagation (TD28)', () => {
    it('dispatches within the context extracted from message.attributes', async () => {
      const attributes = { traceparent: '00-abc-def-01' };

      await controller.push({
        message: { data: 'base64-payload', messageId: 'm-6', attributes },
        subscription: 'sub',
      });

      expect(tracingPort.extractedCarriers).toEqual([attributes]);
      expect(eventBus.dispatchPushMessage).toHaveBeenCalledWith('sub', 'base64-payload');
    });

    it('extracts from an empty carrier when message.attributes is absent', async () => {
      await controller.push({
        message: { data: 'x', messageId: 'm-7' },
        subscription: 'sub',
      });

      expect(tracingPort.extractedCarriers).toEqual([{}]);
    });
  });
});
