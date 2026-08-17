import { ConfigService } from '@nestjs/config';
import { PubSub } from '@google-cloud/pubsub';
import { AppLogger } from '../../observability/app-logger';

// Split out of gcp-pubsub-event-bus.adapter.ts to keep it under the file-length cap —
// topic/subscription auto-provisioning, self-contained plumbing with no dispatch/tracing logic
// of its own, so extracting it can't touch the dispatch()/dispatchTrigger()/dispatchPushMessage()
// symmetry this adapter has repeatedly needed to preserve (see CLAUDE.md's Cloud Run CPU
// throttling / M17-S34 entries).
export class PubSubTopicProvisioner {
  // Owned here (not threaded in by the caller) — every caller shares the same provisioner
  // instance per adapter, so this is the one place the "have we already ensured this topic
  // exists this process lifetime" cache needs to live (avoids a too-many-parameters smell on
  // ensureTopicOnce/publishToDlq from threading a Set through every call site instead).
  private readonly ensuredTopics = new Set<string>();

  constructor(
    private readonly pubsub: PubSub,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  async ensureTopicOnce(topicName: string): Promise<void> {
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

  async ensureSubscription(topicName: string, subscriptionName: string): Promise<void> {
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
