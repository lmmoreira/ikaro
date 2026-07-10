// Shared by CronLoyaltyController (publisher) and the trigger handlers (subscribers) — a
// single source of truth so the trigger name can't drift between the two sides. Also becomes
// the literal Pub/Sub topic name (`ikaro-${name}`, see GcpPubSubEventBusAdapter) in prod, so a
// typo here isn't just a lint nit, it silently creates a topic no one publishes to correctly.
// Two distinct triggers, matching two distinct Scheduler cadences (daily expiry vs. weekly
// warning) — see cron-loyalty.controller.ts for why they must not be merged into one.
export const CRON_LOYALTY_EXPIRY_TRIGGER = 'cron-loyalty-expiry';
export const CRON_LOYALTY_EXPIRY_WARNING_TRIGGER = 'cron-loyalty-expiry-warning';
