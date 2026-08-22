import { z } from 'zod';
import { CountryCodeErrorCode, PlatformErrorCode } from '@ikaro/types';
import {
  BookingSettingsSchema,
  BusinessHoursSettingsSchema,
  BusinessInfoSettingsSchema,
  ChatbotSettingsSchema,
  COUNTRY_CODE_FORMAT_PATTERN,
  LocalizationSettingsFieldsSchema,
  LoyaltySettingsSchema,
  NotificationSettingsSchema,
} from '@ikaro/validation';

// Request Zod schema and its inferred body type — split out of tenant-settings.controller.ts
// so request-side shapes never live inline in the controller (mirrors
// booking/bookings.schemas.ts's existing split).

// `countryCode` is the one field `LocalizationSettingsFieldsSchema` deliberately omits — the
// BFF stays format-only (the backend's full supported-country list isn't available here),
// unlike the backend which layers its own semantic `CountryCode.isValid` check on top. See
// `@ikaro/validation`'s `LocalizationSettingsFieldsSchema` docstring for the full rationale.
const LocalizationSchema = LocalizationSettingsFieldsSchema.extend({
  countryCode: z.string().refine((v) => COUNTRY_CODE_FORMAT_PATTERN.test(v), {
    error: 'countryCode must be a 2-letter ISO 3166-1 alpha-2 code',
    params: { code: CountryCodeErrorCode.FORMAT_INVALID },
  }),
}).partial();

export const UpdateTenantSettingsBodySchema = z.object({
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

export type UpdateTenantSettingsBody = z.infer<typeof UpdateTenantSettingsBodySchema>;
