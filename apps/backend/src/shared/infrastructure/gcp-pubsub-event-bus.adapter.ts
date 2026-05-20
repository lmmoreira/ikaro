import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Message, PubSub, Subscription } from '@google-cloud/pubsub';
import { DomainEvent } from '../domain/domain-event';
import { AppLogger } from '../observability/app-logger';
import { IEventBus } from '../ports/event-bus.port';

interface PendingSubscription {
  topicName: string;
  subscriptionName: string;
  handler: (event: DomainEvent) => Promise<void>;
}

@Injectable()
export class GcpPubSubEventBusAdapter
  implements IEventBus, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new AppLogger(GcpPubSubEventBusAdapter.name);
  private readonly pubsub: PubSub;
  private readonly pending = new Map<string, PendingSubscription>();
  private readonly active: Subscription[] = [];
  private readonly ensuredTopics = new Set<string>();

  constructor() {
    this.pubsub = new PubSub({ projectId: process.env['PUBSUB_PROJECT_ID'] });
  }

  async publish(event: DomainEvent): Promise<void> {
    const topicName = `beloauto-${event.eventName}`;
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
    this.pending.set(eventName, {
      topicName: `beloauto-${eventName}`,
      subscriptionName: `beloauto-${eventName}-${consumerName}`,
      handler: handler as (event: DomainEvent) => Promise<void>,
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    for (const [eventName, config] of this.pending) {
      await this.ensureTopicOnce(config.topicName);
      await this.ensureSubscription(config.topicName, config.subscriptionName);

      const subscription = this.pubsub.subscription(config.subscriptionName);
      subscription.on('message', (message: Message) => {
        this.dispatch(message, eventName, config.handler).catch(() => undefined);
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
  }

  private async dispatch(
    message: Message,
    eventName: string,
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    try {
      const event = JSON.parse(message.data.toString()) as DomainEvent;
      await handler(event);
      message.ack();
    } catch (err) {
      this.logger.error(
        `[pubsub] handler failed for ${eventName}`,
        err instanceof Error ? err.stack : String(err),
      );
      message.nack();
    }
  }

  private async ensureTopicOnce(topicName: string): Promise<void> {
    if (this.ensuredTopics.has(topicName)) return;
    const [exists] = await this.pubsub.topic(topicName).exists();
    if (!exists) {
      await this.pubsub.createTopic(topicName);
      this.logger.log(`[pubsub] created topic ${topicName}`);
    }
    this.ensuredTopics.add(topicName);
  }

  private async ensureSubscription(topicName: string, subscriptionName: string): Promise<void> {
    const topic = this.pubsub.topic(topicName);
    const subscription = topic.subscription(subscriptionName);
    const [exists] = await subscription.exists();
    if (!exists) {
      await topic.createSubscription(subscriptionName);
      this.logger.log(`[pubsub] created subscription ${subscriptionName}`);
    }
  }
}
