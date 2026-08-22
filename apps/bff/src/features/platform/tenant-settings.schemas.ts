import { z } from 'zod';
import { CountryCodeErrorCode, PlatformErrorCode, TimeOfDayErrorCode } from '@ikaro/types';
import {
  COUNTRY_CODE_FORMAT_PATTERN,
  PartialAddressSchema,
  isValidEmail,
  isValidPhoneNumber,
} from '@ikaro/validation';

// Request Zod schema and its inferred body type — split out of tenant-settings.controller.ts
// so request-side shapes never live inline in the controller (mirrors
// booking/bookings.schemas.ts's existing split).
const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const timeOfDayField = (): z.ZodString =>
  z.string().refine((v) => HHMM_REGEX.test(v), {
    error: 'must be HH:MM (00:00–23:59)',
    params: { code: TimeOfDayErrorCode.FORMAT_INVALID },
  });

const DayHoursSchema = z
  .object({
    open: timeOfDayField(),
    close: timeOfDayField(),
  })
  .nullable();

const LoyaltySchema = z
  .object({
    expiryDays: z.number().int().min(1).max(3650),
    enableNotifications: z.boolean(),
    expiryWarningDays: z.number().int().min(1).max(90),
    notificationMinPoints: z.number().int().min(0),
    pointsPerCurrencyUnit: z.number().min(0).max(10000),
  })
  .partial();

const BookingSchema = z
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

const BusinessHoursSchema = z.object({
  timezone: z.string().optional(),
  monday: DayHoursSchema.optional(),
  tuesday: DayHoursSchema.optional(),
  wednesday: DayHoursSchema.optional(),
  thursday: DayHoursSchema.optional(),
  friday: DayHoursSchema.optional(),
  saturday: DayHoursSchema.optional(),
  sunday: DayHoursSchema.optional(),
});

const LocalizationSchema = z
  .object({
    countryCode: z.string().refine((v) => COUNTRY_CODE_FORMAT_PATTERN.test(v), {
      error: 'countryCode must be a 2-letter ISO 3166-1 alpha-2 code',
      params: { code: CountryCodeErrorCode.FORMAT_INVALID },
    }),
    currency: z.string().min(1),
    currencySymbol: z.string().min(1).max(3),
    language: z.string().min(1),
    decimalPlaces: z.number().int().min(0).max(8),
  })
  .partial();

const SocialLinksSchema = z.object({
  whatsapp: z
    .string()
    .refine((v) => isValidPhoneNumber(v), {
      error: 'whatsapp must be in E.164 format',
      params: { code: PlatformErrorCode.SETTINGS_SOCIAL_WHATSAPP_INVALID },
    })
    .nullable()
    .optional(),
  instagram: z.string().nullable().optional(),
  facebook: z.string().nullable().optional(),
});

const BusinessInfoSchema = z
  .object({
    phone: z
      .string()
      .refine((v) => isValidPhoneNumber(v), {
        error: 'businessInfo.phone must be in E.164 format',
        params: { code: PlatformErrorCode.SETTINGS_BUSINESS_PHONE_INVALID },
      })
      .nullable(),
    email: z
      .string()
      .refine((v) => isValidEmail(v), {
        error: 'businessInfo.email must be a valid email address',
        params: { code: PlatformErrorCode.SETTINGS_BUSINESS_EMAIL_INVALID },
      })
      .nullable(),
    address: PartialAddressSchema.nullable(),
    // socialLinks must accept null the same way address does — the settings form sends
    // null when whatsapp/instagram/facebook are all blank (they're an all-or-nothing group
    // client-side, mirroring how the address section works). A bare `.optional()` here
    // (pre-fix) only allowed the object shape or omission, rejecting an explicit null with
    // "expected object, received null".
    socialLinks: SocialLinksSchema.nullable(),
  })
  .partial();

const NotificationSchema = z
  .object({
    fromEmail: z.string().nullable(),
  })
  .partial();

// Only `knowledgeText` is accepted here — the resolved `maxKnowledgeTextLength` cap (default or a
// tenant's own Ikaro-granted override) is enforced by ChatbotSettingsValidator in the backend's
// domain layer, not here: a hardcoded Zod .max() would make an above-default override unenforceable.
// `.strict()` rejects any other `chatbot.*` key (the 8 caps, llmProvider/llmModel) with 400 —
// deliberately not silently stripped, unlike the other categories' sub-schemas.
const ChatbotSchema = z
  .object({
    knowledgeText: z.string(),
  })
  .partial()
  .strict();

export const UpdateTenantSettingsBodySchema = z.object({
  settings: z
    .object({
      loyalty: LoyaltySchema.optional(),
      booking: BookingSchema.optional(),
      businessHours: BusinessHoursSchema.optional(),
      notification: NotificationSchema.optional(),
      localization: LocalizationSchema.optional(),
      businessInfo: BusinessInfoSchema.optional(),
      chatbot: ChatbotSchema.optional(),
    })
    .strict()
    .refine((settings) => Object.values(settings).some((value) => value !== undefined), {
      error: 'at least one settings field must be provided',
      params: { code: PlatformErrorCode.SETTINGS_UPDATE_EMPTY },
    }),
});

export type UpdateTenantSettingsBody = z.infer<typeof UpdateTenantSettingsBodySchema>;
