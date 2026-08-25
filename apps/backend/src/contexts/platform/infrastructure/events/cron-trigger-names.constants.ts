// Shared by CronChatbotController (publisher) and ChatbotRetentionPurgeTriggerHandler /
// ChatbotBalancePollTriggerHandler (subscribers) — a single source of truth so the trigger
// name can't drift between the two sides. Also becomes the literal Pub/Sub topic name
// (`ikaro-${name}`, see GcpPubSubEventBusAdapter) in prod, so a typo here isn't just a lint
// nit, it silently creates a topic no one publishes to correctly (mirrors loyalty's
// cron-trigger-names.constants.ts).
export const CRON_CHATBOT_RETENTION_PURGE_TRIGGER = 'cron-chatbot-retention-purge';
export const CRON_CHATBOT_BALANCE_POLL_TRIGGER = 'cron-chatbot-balance-poll';
// M20-S04 (UC-043): shared by CronLeadFormController (publisher) and
// LeadFormRetentionPurgeTriggerHandler (subscriber).
export const CRON_LEAD_FORM_RETENTION_TRIGGER = 'cron-lead-form-retention';
