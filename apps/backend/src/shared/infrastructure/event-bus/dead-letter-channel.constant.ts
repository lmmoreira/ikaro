// Shared by GcpPubSubEventBusAdapter.publishToDlq() (publisher) and DeadLetterHandler
// (subscriber) — a single source of truth so the channel name can't drift between the two
// sides. Also becomes the literal Pub/Sub topic name (`ikaro-${name}`, see
// GcpPubSubEventBusAdapter.subscribe()), so a typo here isn't just a lint nit, it silently
// creates a topic no one publishes to correctly (docs/ENGINEERING_RULES.md §Event Handlers).
export const DEAD_LETTER_CHANNEL_NAME = 'dead-letter';
