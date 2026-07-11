import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { z } from 'zod';
import {
  CountryCodeErrorCode,
  PlatformErrorCode,
  TenantSettingsResponse,
  TimeOfDayErrorCode,
} from '@ikaro/types';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';

const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const timeOfDayField = () =>
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
    countryCode: z.string().refine((v) => /^[A-Za-z]{2}$/.test(v), {
      error: 'countryCode must be a 2-letter ISO 3166-1 alpha-2 code',
      params: { code: CountryCodeErrorCode.FORMAT_INVALID },
    }),
    currency: z.string().min(1),
    currencySymbol: z.string().min(1).max(3),
    language: z.string().min(1),
    decimalPlaces: z.number().int().min(0).max(8),
  })
  .partial();

const BusinessInfoAddressSchema = z
  .object({
    street: z.string().nullable(),
    number: z.string().nullable(),
    complement: z.string().optional(),
    neighborhood: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().trim().min(1).max(10).nullable(),
    zipCode: z.string().trim().min(1).max(20).nullable(),
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
    address: BusinessInfoAddressSchema.nullable(),
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

export const UpdateTenantSettingsBodySchema = z.object({
  settings: z
    .object({
      loyalty: LoyaltySchema.optional(),
      booking: BookingSchema.optional(),
      businessHours: BusinessHoursSchema.optional(),
      notification: NotificationSchema.optional(),
      localization: LocalizationSchema.optional(),
      businessInfo: BusinessInfoSchema.optional(),
    })
    .strict()
    .refine((settings) => Object.values(settings).some((value) => value !== undefined), {
      error: 'at least one settings field must be provided',
      params: { code: PlatformErrorCode.SETTINGS_UPDATE_EMPTY },
    }),
});

type UpdateTenantSettingsBody = z.infer<typeof UpdateTenantSettingsBodySchema>;

@Controller('tenants')
export class TenantSettingsController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get('settings')
  @Roles('STAFF', 'MANAGER')
  getSettings(): Promise<TenantSettingsResponse> {
    return this.backendHttp.get<TenantSettingsResponse>('/tenants/settings');
  }

  @Patch('settings')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER')
  updateSettings(
    @Body(new ZodValidationPipe(UpdateTenantSettingsBodySchema)) body: UpdateTenantSettingsBody,
  ): Promise<TenantSettingsResponse> {
    return this.backendHttp.patch<TenantSettingsResponse>('/tenants/settings', body);
  }
}
