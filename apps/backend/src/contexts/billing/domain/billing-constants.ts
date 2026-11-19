// Billing constants defined once (docs/DOMAIN_MODEL.md § Context 7: Billing Context, "Constants").
// Every later Billing constant joins this file, added by the first story that needs it (M26-D5);
// `TRIAL_DAYS` and `PROVISIONING_GRACE_MINUTES` stay where M25 put them.

/** A recovery charge is due this many days after issue (a charge due today would be OVERDUE on the next sweep). */
export const RECOVERY_CHARGE_DUE_DAYS = 7;

/** A creation claim is held this long before another creator may take the charge over. */
export const PROVIDER_CREATION_LEASE_MINUTES = 10;
