import { z } from 'zod';
import {
  LocalizationSettingsFieldsSchema,
  buildUpdateTenantSettingsSchema,
} from '@ikaro/validation';
import { CountryCodeSchema } from './country-code.schema';

// `countryCode` is the one field `LocalizationSettingsFieldsSchema` deliberately omits — the
// backend layers its own semantic `CountryCode.isValid` check (via `CountryCodeSchema`) on top
// of the shared format pattern, unlike the BFF which stays format-only. See
// `@ikaro/validation`'s `LocalizationSettingsFieldsSchema` docstring for the full rationale.
const LocalizationSchema = LocalizationSettingsFieldsSchema.extend({
  countryCode: CountryCodeSchema,
}).partial();

export const UpdateTenantSettingsSchema = buildUpdateTenantSettingsSchema(LocalizationSchema);

export type UpdateTenantSettingsDto = z.infer<typeof UpdateTenantSettingsSchema>;
