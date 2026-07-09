import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Message, PubSub, Subscription } from '@google-cloud/pubsub';
import { DomainEvent } from '../domain/domain-event';
import { AppLogger } from '../observability/app-logger';
import { IEventBus } from '../ports/event-bus.port';
import { IPushableEventBus } from '../ports/pushable-event-bus.port';

interface PendingSubscription {
  eventName: string;
  topicName: string;
  subscriptionName: string;
  handler: (event: DomainEvent) => Promise<void>;
}

@Injectable()
export class GcpPubSubEventBusAdapter
  implements IEventBus, IPushableEventBus, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new AppLogger(GcpPubSubEventBusAdapter.name);
  private readonly pubsub: PubSub;
  private readonly pending = new Map<string, PendingSubscription>();
  private readonly active: Subscription[] = [];
  private readonly ensuredTopics = new Set<string>();

  constructor(private readonly config: ConfigService) {
    this.pubsub = new PubSub({ projectId: config.getOrThrow<string>('PUBSUB_PROJECT_ID') });
  }

  async publish(event: DomainEvent): Promise<void> {
    const topicName = `ikaro-${event.eventName}`;
    await this.ensureTopicOnce(topicName);
    await this.pubsub.topic(topicName).publishMessage({
      data: Buffer.from(JSON.stringify(event)),
      attributes: { eventName: event.eventName, tenantId: event.tenantId },
    });
    this.logger.debug(`[pubsub] published ${event.eventName}`, {
      tenantId: event.tenantId,
      eventId: event.eventId,
      correlationId: event.correlationId,
    });
  }

  subscribe<T extends DomainEvent>(
    eventName: string,
    handler: (event: T) => Promise<void>,
    consumerName: string,
  ): void {
    // PUBSUB_SUBSCRIPTION_SUFFIX lets integration tests isolate subscriptions per test run
    const suffix = this.config.get<string>('PUBSUB_SUBSCRIPTION_SUFFIX', '');
    const subscriptionName = `ikaro-${eventName}-${consumerName}${suffix}`;
    // Key by subscriptionName (not eventName) so multiple consumers per event are all registered
    this.pending.set(subscriptionName, {
      eventName,
      topicName: `ikaro-${eventName}`,
      subscriptionName,
      handler: handler as (event: DomainEvent) => Promise<void>,
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    const mode = this.config.get<'pull' | 'push'>('PUBSUB_CONSUMER_MODE', 'pull');

    if (mode === 'push') {
      // Push mode: Pub/Sub POSTs to /pubsub/push instead of us holding a streaming-pull connection
      // open — no subscriptions to open here, dispatchPushMessage() routes by subscription name.
      this.logger.log(
        `[pubsub] push mode — ${this.pending.size} handler(s) registered for /pubsub/push, no streaming pull opened`,
      );
      this.logger.warn(
        '[pubsub] PUBSUB_MAX_DELIVERY_ATTEMPTS is inert in push mode — the Pub/Sub subscription retry/dead-letter policy owns redelivery',
      );
      return;
    }

    for (const config of this.pending.values()) {
      await this.ensureTopicOnce(config.topicName);
      await this.ensureSubscription(config.topicName, config.subscriptionName);

      const subscription = this.pubsub.subscription(config.subscriptionName);
      subscription.on('message', (message: Message) => {
        this.dispatch(message, config.eventName, config.handler).catch(() => undefined);
      });
      subscription.on('error', (err: Error) => {
        this.logger.error(`[pubsub] subscription error on ${config.subscriptionName}`, err.stack);
      });
      this.active.push(subscription);
      this.logger.log(`[pubsub] listening on ${config.subscriptionName}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.active.map((s) => s.close()));
    this.logger.log(`[pubsub] closed ${this.active.length} subscription(s) on shutdown`);
  }

  private async dispatch(
    message: Message,
    eventName: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    let event: DomainEvent;
    try {
      event = JSON.parse(message.data.toString()) as DomainEvent;
    } catch {
      this.logger.error('[pubsub] unparseable message — ACKing to prevent retry loop', undefined, {
        eventName,
        rawBytes: message.data.toString().slice(0, 200),
      });
      message.ack();
      return;
    }

    try {
      await handler(event);
      message.ack();
    } catch (err) {
      const attempt = message.deliveryAttempt ?? 1;
      const max = this.config.get<number>('PUBSUB_MAX_DELIVERY_ATTEMPTS', 5);
      this.logger.error(
        `[pubsub] handler failed for ${eventName} (attempt ${attempt}/${max})`,
        err instanceof Error ? err.stack : String(err),
      );
      if (attempt >= max) {
        await this.publishToDlq(message, event, eventName, err);
        message.ack();
      } else {
        message.nack();
      }
    }
  }

  // PORTABILITY: the Pub/Sub push envelope shape (subscription full name + base64 data) is
  // GCP-specific (D2 ledger) — confined to this one method. Success = return (controller ACKs with
  // 204); throw = controller responds 5xx and Pub/Sub's own subscription retry/dead-letter policy
  // (not app-level PUBSUB_MAX_DELIVERY_ATTEMPTS) owns redelivery in this mode.
  async dispatchPushMessage(subscriptionFullName: string, base64Data: string): Promise<void> {
    const subscriptionName = subscriptionFullName.split('/').pop() ?? subscriptionFullName;
    const config = this.pending.get(subscriptionName);

    if (!config) {
      this.logger.error(
        `[pubsub] push message for unregistered subscription "${subscriptionName}" — acking to prevent redelivery loop`,
      );
      return;
    }

    let event: DomainEvent;
    try {
      event = JSON.parse(Buffer.from(base64Data, 'base64').toString('utf8')) as DomainEvent;
    } catch {
      this.logger.error(
        `[pubsub] unparseable push message on ${subscriptionName} — acking to prevent redelivery loop`,
      );
      return;
    }

    await config.handler(event);
  }

  private async publishToDlq(
    message: Message,
    event: DomainEvent,
    eventName: string,
    err: unknown,
  ): Promise<void> {
    const dlqTopic = 'ikaro-dead-letter';
    await this.ensureTopicOnce(dlqTopic);
    const serialized = structuredClone(event) as unknown as Record<string, unknown>;
    const enrichedData = {
      ...serialized,
      deadLetterReason: err instanceof Error ? err.message : String(err),
      deliveryAttempt: message.deliveryAttempt ?? 1,
    };
    await this.pubsub.topic(dlqTopic).publishMessage({
      data: Buffer.from(JSON.stringify(enrichedData)),
      attributes: {
        ...message.attributes,
        originalEventName: eventName,
      },
    });
    this.logger.warn(`[pubsub] routed to DLQ: ${eventName}`, {
      eventId: event.eventId,
      tenantId: event.tenantId,
      deliveryAttempt: message.deliveryAttempt ?? 1,
    });
  }

  private async ensureTopicOnce(topicName: string): Promise<void> {
    if (!this.config.get<boolean>('PUBSUB_AUTO_CREATE', true)) return;
    if (this.ensuredTopics.has(topicName)) return;
    const [exists] = await this.pubsub.topic(topicName).exists();
    if (!exists) {
      try {
        await this.pubsub.createTopic(topicName);
        this.logger.log(`[pubsub] created topic ${topicName}`);
      } catch (err) {
        // gRPC ALREADY_EXISTS (code 6): another process beat us to creation — safe to ignore
        if ((err as { code?: number }).code !== 6) throw err;
      }
    }
    this.ensuredTopics.add(topicName);
  }

  private async ensureSubscription(topicName: string, subscriptionName: string): Promise<void> {
    if (!this.config.get<boolean>('PUBSUB_AUTO_CREATE', true)) return;
    const topic = this.pubsub.topic(topicName);
    const subscription = topic.subscription(subscriptionName);
    const [exists] = await subscription.exists();
    if (!exists) {
      try {
        await topic.createSubscription(subscriptionName);
        this.logger.log(`[pubsub] created subscription ${subscriptionName}`);
      } catch (err) {
        // gRPC ALREADY_EXISTS (code 6): another process beat us to creation — safe to ignore
        if ((err as { code?: number }).code !== 6) throw err;
      }
    }
  }
}
