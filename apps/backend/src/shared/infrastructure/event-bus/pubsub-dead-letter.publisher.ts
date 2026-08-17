import { Message, PubSub } from '@google-cloud/pubsub';
import { Envelope } from '../../domain/envelope';
import { AppLogger } from '../../observability/app-logger';
import { DEAD_LETTER_CHANNEL_NAME } from './dead-letter-channel.constant';
import { PubSubTopicProvisioner } from './pubsub-topic-provisioner';

// Split out of gcp-pubsub-event-bus.adapter.ts (TD37-S05, file-length) — only called from
// dispatch()'s own catch block when delivery attempts are exhausted; self-contained side effect
// that doesn't touch the dispatch()/dispatchTrigger()/dispatchPushMessage() tracing symmetry.
export async function publishToDlq(
  pubsub: PubSub,
  provisioner: PubSubTopicProvisioner,
  ensuredTopics: Set<string>,
  logger: AppLogger,
  message: Message,
  event: Envelope,
  eventName: string,
  err: unknown,
): Promise<void> {
  const dlqTopic = `ikaro-${DEAD_LETTER_CHANNEL_NAME}`;
  await provisioner.ensureTopicOnce(dlqTopic, ensuredTopics);
  // event is spread into a new object below, never mutated — no defensive clone needed.
  const enrichedData = {
    ...event,
    deadLetterReason: err instanceof Error ? err.message : String(err),
    deliveryAttempt: message.deliveryAttempt ?? 1,
  };
  await pubsub.topic(dlqTopic).publishMessage({
    data: Buffer.from(JSON.stringify(enrichedData)),
    attributes: {
      ...message.attributes,
      originalEventName: eventName,
    },
  });
  logger.warn(`[pubsub] routed to DLQ: ${eventName}`, {
    eventId: event.eventId,
    tenantId: event.tenantId,
    deliveryAttempt: message.deliveryAttempt ?? 1,
  });
}
