import { z } from 'zod';

const DayHoursSchema = z
  .object({
    open: z.string().regex(/^\d{2}:\d{2}$/, 'must be HH:MM'),
    close: z.string().regex(/^\d{2}:\d{2}$/, 'must be HH:MM'),
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
    currency: z.string().min(1),
    currency_symbol: z.string().min(1).max(3),
    language: z.string().min(1),
    decimal_places: z.number().int().min(0).max(8),
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
      })
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.settings !== undefined, {
    message: 'at least one of name or settings must be provided',
  });

export type UpdateTenantSettingsDto = z.infer<typeof UpdateTenantSettingsSchema>;
