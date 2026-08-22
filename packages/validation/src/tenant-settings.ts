import { z } from 'zod';
import { PlatformErrorCode, TimeOfDayErrorCode, TimezoneErrorCode } from '@ikaro/types';
import { PartialAddressSchema } from './address';
import { isValidTimeOfDay, isValidTimezone } from './date';
import { isValidEmail } from './email';
import { isValidPhoneNumber } from './phone';

const timeOfDayField = (): z.ZodString =>
  z.string().refine(isValidTimeOfDay, {
    error: 'must be HH:MM (00:00–23:59)',
    params: { code: TimeOfDayErrorCode.FORMAT_INVALID },
  });

const DayHoursSchema = z
  .object({
    open: timeOfDayField(),
    close: timeOfDayField(),
  })
  .nullable();

export const LoyaltySettingsSchema = z
  .object({
    expiryDays: z.number().int().min(1).max(3650),
    enableNotifications: z.boolean(),
    expiryWarningDays: z.number().int().min(1).max(90),
    notificationMinPoints: z.number().int().min(0).max(10000),
    pointsPerCurrencyUnit: z.number().int().min(0).max(10000),
  })
  .partial();

export const BookingSettingsSchema = z
  .object({
    cancellationWindowHours: z.number().int().min(0).max(720),
    autoApproveEnabled: z.boolean(),
    minBookingAdvanceHours: z.number().int().min(0),
    maxBookingAdvanceDays: z.number().int().min(1),
    serviceBufferMinutes: z.number().int().min(0).max(120),
    slotGranularityMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    welcomeStaffScreenDays: z.number().int().min(1).max(90),
  })
  .partial();

export const BusinessHoursSettingsSchema = z.object({
  timezone: z
    .string()
    .refine(isValidTimezone, {
      error: 'must be a valid IANA timezone',
      params: { code: TimezoneErrorCode.INVALID },
    })
    .optional(),
  monday: DayHoursSchema.optional(),
  tuesday: DayHoursSchema.optional(),
  wednesday: DayHoursSchema.optional(),
  thursday: DayHoursSchema.optional(),
  friday: DayHoursSchema.optional(),
  saturday: DayHoursSchema.optional(),
  sunday: DayHoursSchema.optional(),
});

/**
 * `localization`'s shared fields only — `countryCode` is deliberately excluded and stays
 * app-specific: the backend layers its own `CountryCode.isValid` semantic/supported-list check
 * (via `CountryCodeSchema`, apps/backend) on top of the shared format pattern
 * (`COUNTRY_CODE_FORMAT_PATTERN`, `./country-code`), while the BFF stays format-only since the
 * full supported-country list isn't available to it. Each app composes its own `localization`
 * object schema from this plus its own `countryCode` field.
 */
export const LocalizationSettingsFieldsSchema = z
  .object({
    currency: z.string().min(1),
    currencySymbol: z.string().min(1).max(3),
    language: z.string().min(1),
    decimalPlaces: z.number().int().min(0).max(8),
  })
  .partial();

export const SocialLinksSettingsSchema = z.object({
  whatsapp: z
    .string()
    .refine(isValidPhoneNumber, {
      error: 'whatsapp must be in E.164 format',
      params: { code: PlatformErrorCode.SETTINGS_SOCIAL_WHATSAPP_INVALID },
    })
    .nullable()
    .optional(),
  instagram: z.string().nullable().optional(),
  facebook: z.string().nullable().optional(),
});

export const BusinessInfoSettingsSchema = z
  .object({
    phone: z
      .string()
      .refine(isValidPhoneNumber, {
        error: 'businessInfo.phone must be in E.164 format',
        params: { code: PlatformErrorCode.SETTINGS_BUSINESS_PHONE_INVALID },
      })
      .nullable(),
    email: z
      .string()
      .refine(isValidEmail, {
        error: 'businessInfo.email must be a valid email address',
        params: { code: PlatformErrorCode.SETTINGS_BUSINESS_EMAIL_INVALID },
      })
      .nullable(),
    address: PartialAddressSchema.nullable(),
    // socialLinks must accept null the same way address does — the settings form sends null
    // when whatsapp/instagram/facebook are all blank (an all-or-nothing group client-side,
    // mirroring the address section).
    socialLinks: SocialLinksSettingsSchema.nullable(),
  })
  .partial();

export const NotificationSettingsSchema = z
  .object({
    fromEmail: z.string().nullable(),
  })
  .partial();

// Only `knowledgeText` is accepted here — the resolved `maxKnowledgeTextLength` cap (default or a
// tenant's own Ikaro-granted override) is enforced by ChatbotSettingsValidator in the backend's
// domain layer, not here: a hardcoded Zod .max() would make an above-default override unenforceable.
// `.strict()` rejects any other `chatbot.*` key (the 8 caps, llmProvider/llmModel) with 400 —
// deliberately not silently stripped, unlike the other categories' sub-schemas.
export const ChatbotSettingsSchema = z
  .object({
    knowledgeText: z.string(),
  })
  .partial()
  .strict();

/**
 * Full `PATCH /tenants/settings` body composition, shared by both apps. Takes the caller's own
 * `localization` schema as a parameter — the one category that isn't fully shareable (backend
 * layers a semantic `CountryCode.isValid` check on `LocalizationSettingsFieldsSchema`, BFF stays
 * format-only; see that schema's docstring). Every other category is identical across apps and
 * composed here directly, so neither app duplicates the object shape/`.strict()`/empty-update
 * `.refine()` — the exact wrapper-level duplication this migration exists to remove.
 */
export function buildUpdateTenantSettingsSchema<T extends z.ZodTypeAny>(localizationSchema: T) {
  return z.object({
    settings: z
      .object({
        loyalty: LoyaltySettingsSchema.optional(),
        booking: BookingSettingsSchema.optional(),
        businessHours: BusinessHoursSettingsSchema.optional(),
        notification: NotificationSettingsSchema.optional(),
        localization: localizationSchema.optional(),
        businessInfo: BusinessInfoSettingsSchema.optional(),
        chatbot: ChatbotSettingsSchema.optional(),
      })
      .strict()
      .refine((settings) => Object.values(settings).some((value) => value !== undefined), {
        error: 'at least one settings field must be provided',
        params: { code: PlatformErrorCode.SETTINGS_UPDATE_EMPTY },
      }),
  });
}
