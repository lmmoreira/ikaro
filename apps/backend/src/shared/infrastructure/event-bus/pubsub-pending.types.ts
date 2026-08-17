import { Envelope } from '../../domain/envelope';

// Split out of gcp-pubsub-event-bus.adapter.ts (TD37-S05, file-length).
export interface PendingSubscription {
  eventName: string;
  topicName: string;
  subscriptionName: string;
  handler: (event: Envelope) => Promise<void>;
}

export interface PendingTrigger {
  triggerName: string;
  topicName: string;
  subscriptionName: string;
  handler: () => Promise<void>;
}
