// Shared by CronBillingController (publisher) and the Billing trigger handlers (subscribers): one
// source of truth, so the name cannot drift between the two sides. It is also the literal Pub/Sub
// topic (`ikaro-${name}`) and, minus the topic prefix, the Cloud Scheduler job, validated one to
// one by `infra/terraform/modules/scheduler`. Each Billing job story (M26-S05 to S10) adds its own.
export const CRON_BILLING_ISSUE_CHARGES_TRIGGER = 'cron-billing-issue-charges';
