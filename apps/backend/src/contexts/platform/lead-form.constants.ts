// Defaults for tenants provisioned before M20-S03 backfills `tenants.settings.leadForm`
// (docs/21-TENANTS_SETTINGS_SCHEMA.md §8) — resolved as `tenant.settings.leadForm?.X ?? DEFAULT_X`.
// Unlike chatbot.constants.ts's platform-wide overrides, these three fields are normal
// tenant-editable settings (UC-042) once S03 lands; these constants exist purely as a defensive
// fallback for the gap between S02 and S03, not because the value is meant to stay fixed
// thereafter. Values match docs/21-TENANTS_SETTINGS_SCHEMA.md §8's own documented defaults.
export const DEFAULT_LEAD_FORM_RETENTION_MONTHS = 6;
export const DEFAULT_MAX_SUBMISSIONS_PER_DAY = 100;
export const DEFAULT_MAX_SUBMISSIONS_PER_IP_PER_DAY = 3;
