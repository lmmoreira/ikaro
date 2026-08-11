import { z } from 'zod';
import { PlatformErrorCode, TimeOfDayErrorCode, TimezoneErrorCode } from '@ikaro/types';
import { PartialAddressSchema } from '@ikaro/validation';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { Timezone } from '../../../../shared/value-objects/timezone.vo';
import { CountryCodeSchema } from './country-code.schema';

const DayHoursSchema = z
  .object({
    open: z.string().refine(TimeOfDay.isValid, {
      error: 'must be HH:MM (00:00–23:59)',
      params: { code: TimeOfDayErrorCode.FORMAT_INVALID },
    }),
    close: z.string().refine(TimeOfDay.isValid, {
      error: 'must be HH:MM (00:00–23:59)',
      params: { code: TimeOfDayErrorCode.FORMAT_INVALID },
    }),
  })
  .nullable();

const LoyaltySchema = z
  .object({
    expiryDays: z.number().int().min(1).max(3650),
    enableNotifications: z.boolean(),
    expiryWarningDays: z.number().int().min(1).max(90),
    notificationMinPoints: z.number().int().min(0).max(10000),
    pointsPerCurrencyUnit: z.number().int().min(0).max(10000),
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
  timezone: z
    .string()
    .refine(Timezone.isValid, {
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

const LocalizationSchema = z
  .object({
    countryCode: CountryCodeSchema,
    currency: z.string().min(1),
    currencySymbol: z.string().min(1).max(3),
    language: z.string().min(1),
    decimalPlaces: z.number().int().min(0).max(8),
  })
  .partial();

const SocialLinksSchema = z.object({
  whatsapp: z.string().nullable().optional(),
  instagram: z.string().nullable().optional(),
  facebook: z.string().nullable().optional(),
});

const BusinessInfoSchema = z
  .object({
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address: PartialAddressSchema.nullable(),
    // socialLinks must accept null the same way address does — the settings form sends
    // null when whatsapp/instagram/facebook are all blank. A bare `.optional()` here
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
// tenant's own Ikaro-granted override) is enforced by ChatbotSettingsValidator in the domain layer,
// not here: a hardcoded Zod .max() would make an above-default override unenforceable. `.strict()`
// rejects any other `chatbot.*` key (the 8 caps, llmProvider/llmModel) with 400 — deliberately not
// silently stripped, unlike the other categories' sub-schemas.
const ChatbotSchema = z
  .object({
    knowledgeText: z.string(),
  })
  .partial()
  .strict();

export const UpdateTenantSettingsSchema = z.object({
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

export type UpdateTenantSettingsDto = z.infer<typeof UpdateTenantSettingsSchema>;
