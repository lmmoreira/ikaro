import { z } from 'zod';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { Timezone } from '../../../../shared/value-objects/timezone.vo';

const DayHoursSchema = z
  .object({
    open: z.string().refine(TimeOfDay.isValid, { message: 'must be HH:MM (00:00–23:59)' }),
    close: z.string().refine(TimeOfDay.isValid, { message: 'must be HH:MM (00:00–23:59)' }),
  })
  .nullable();

const LoyaltySchema = z
  .object({
    expiry_days: z.number().int().min(1).max(3650),
    enable_notifications: z.boolean(),
    expiry_warning_days: z.number().int().min(1).max(90),
  })
  .partial();

const BookingSchema = z
  .object({
    cancellation_window_hours: z.number().int().min(0).max(720),
    auto_approve_enabled: z.boolean(),
    min_booking_advance_hours: z.number().int().min(0),
    max_booking_advance_days: z.number().int().min(1),
    service_buffer_minutes: z.number().int().min(0).max(120),
    slot_granularity_minutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  })
  .partial();

const BusinessHoursSchema = z.object({
  timezone: z
    .string()
    .refine(Timezone.isValid, { message: 'must be a valid IANA timezone' })
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
    country_code: z
      .string()
      .regex(/^[A-Za-z]{2}$/, {
        message: 'country_code must be a 2-letter ISO 3166-1 alpha-2 code',
      })
      .toUpperCase(),
    currency: z.string().min(1),
    currency_symbol: z.string().min(1).max(3),
    language: z.string().min(1),
    decimal_places: z.number().int().min(0).max(8),
  })
  .partial();

const BusinessInfoAddressSchema = z
  .object({
    street: z.string().nullable(),
    number: z.string().nullable(),
    complement: z.string().optional(),
    neighborhood: z.string().nullable(),
    city: z.string().nullable(),
    state: z
      .string()
      .regex(/^[A-Z]{2}$/, 'must be a 2-letter uppercase UF')
      .nullable(),
    zip_code: z
      .string()
      .regex(/^\d{8}$/, 'must be exactly 8 digits')
      .nullable(),
  })
  .partial();

const SocialLinksSchema = z
  .object({
    whatsapp: z.string().nullable().optional(),
    instagram: z.string().nullable().optional(),
    facebook: z.string().nullable().optional(),
  })
  .optional();

const BusinessInfoSchema = z
  .object({
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address: BusinessInfoAddressSchema.nullable(),
    social_links: SocialLinksSchema,
  })
  .partial();

export const UpdateTenantSettingsSchema = z
  .object({
    name: z.string().min(1, 'name must not be empty').optional(),
    settings: z
      .object({
        loyalty: LoyaltySchema.optional(),
        booking: BookingSchema.optional(),
        business_hours: BusinessHoursSchema.optional(),
        localization: LocalizationSchema.optional(),
        business_info: BusinessInfoSchema.optional(),
      })
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.settings !== undefined, {
    message: 'at least one of name or settings must be provided',
  });

export type UpdateTenantSettingsDto = z.infer<typeof UpdateTenantSettingsSchema>;
