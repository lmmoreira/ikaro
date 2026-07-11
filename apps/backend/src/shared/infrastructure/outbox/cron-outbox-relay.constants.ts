// Shared by OutboxRelayController (publisher) and OutboxRelayTriggerHandler (subscriber) — a
// single source of truth so the trigger name can't drift between the two sides. Also becomes the
// literal Pub/Sub topic name (`ikaro-${name}`, see GcpPubSubEventBusAdapter) in prod — mirrors
// booking's cron-trigger-names.constants.ts pattern.
export const CRON_OUTBOX_RELAY_TRIGGER = 'cron-outbox-relay';
