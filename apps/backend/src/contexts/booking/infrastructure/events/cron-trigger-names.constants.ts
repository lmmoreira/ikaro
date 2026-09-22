// Shared by CronBookingController (publisher) and its trigger handlers (subscribers) — a
// single source of truth so the trigger name can't drift between the two sides. Also becomes
// the literal Pub/Sub topic name (`ikaro-${name}`, see GcpPubSubEventBusAdapter) in prod, so a
// typo here isn't just a lint nit, it silently creates a topic no one publishes to correctly.
export const CRON_REMINDERS_TRIGGER = 'cron-reminders';
export const CRON_RESOURCE_OCCUPANCY_RETENTION_PURGE_TRIGGER =
  'cron-resource-occupancy-retention-purge';
