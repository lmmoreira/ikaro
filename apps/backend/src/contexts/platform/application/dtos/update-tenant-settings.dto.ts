import { z } from 'zod';
import { PlatformErrorCode } from '@ikaro/types/protocol/errors';
import {
  BookingSettingsSchema,
  BusinessHoursSettingsSchema,
  BusinessInfoSettingsSchema,
  ChatbotSettingsSchema,
  LocalizationSettingsFieldsSchema,
  LoyaltySettingsSchema,
  NotificationSettingsSchema,
} from '@ikaro/validation';
import { CountryCodeSchema } from './country-code.schema';

// `countryCode` is the one field `LocalizationSettingsFieldsSchema` deliberately omits — the
// backend layers its own semantic `CountryCode.isValid` check (via `CountryCodeSchema`) on top
// of the shared format pattern, unlike the BFF which stays format-only. See
// `@ikaro/validation`'s `LocalizationSettingsFieldsSchema` docstring for the full rationale.
const LocalizationSchema = LocalizationSettingsFieldsSchema.extend({
  countryCode: CountryCodeSchema,
}).partial();

export const UpdateTenantSettingsSchema = z.object({
  settings: z
    .object({
      loyalty: LoyaltySettingsSchema.optional(),
      booking: BookingSettingsSchema.optional(),
      businessHours: BusinessHoursSettingsSchema.optional(),
      notification: NotificationSettingsSchema.optional(),
      localization: LocalizationSchema.optional(),
      businessInfo: BusinessInfoSettingsSchema.optional(),
      chatbot: ChatbotSettingsSchema.optional(),
    })
    .strict()
    .refine((settings) => Object.values(settings).some((value) => value !== undefined), {
      error: 'at least one settings field must be provided',
      params: { code: PlatformErrorCode.SETTINGS_UPDATE_EMPTY },
    }),
});

export type UpdateTenantSettingsDto = z.infer<typeof UpdateTenantSettingsSchema>;
