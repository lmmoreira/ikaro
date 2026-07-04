import { z } from 'zod';
import type { TenantSettingsResponse, UpdateTenantSettingsRequest } from '@ikaro/types';
import { digitsOnly } from '@/shared/utils/digits-only';

export const SETTINGS_TIMEZONES = [
  'America/Sao_Paulo',
  'America/Fortaleza',
  'America/Manaus',
  'America/Rio_Branco',
  'America/Noronha',
] as const;

export const WEEK_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type WeekDay = (typeof WEEK_DAYS)[number];

export interface DayHoursValue {
  readonly open: string;
  readonly close: string;
  readonly closed: boolean;
}

export interface SettingsAddressValues {
  readonly street: string;
  readonly number: string;
  readonly complement: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
  readonly zipCode: string;
}

export interface SettingsFormValues {
  readonly name: string;
  readonly cancellationWindowHours: string;
  readonly serviceBufferMinutes: string;
  readonly loyaltyExpiryDays: string;
  readonly pointsPerCurrencyUnit: string;
  readonly timezone: string;
  readonly days: Record<WeekDay, DayHoursValue>;
  readonly phone: string;
  readonly email: string;
  readonly address: SettingsAddressValues;
}

export interface SettingsFormErrors {
  name?: string;
  cancellationWindowHours?: string;
  serviceBufferMinutes?: string;
  loyaltyExpiryDays?: string;
  pointsPerCurrencyUnit?: string;
  timezone?: string;
  phone?: string;
  email?: string;
  submit?: string;
}

export interface NormalizedSettingsForm {
  readonly name: string;
  readonly settings: UpdateTenantSettingsRequest['settings'];
}

// Mirrors the BFF's UpdateTenantSettingsBodySchema ranges exactly
// (apps/bff/src/features/platform/tenant-settings.controller.ts).
// pointsPerCurrencyUnit additionally enforces int, per the story spec.
export const SettingsFormSchema = z.object({
  name: z.string().trim().min(1),
  cancellationWindowHours: z.number().int().min(0).max(720),
  serviceBufferMinutes: z.number().int().min(0).max(120),
  loyaltyExpiryDays: z.number().int().min(1).max(3650),
  pointsPerCurrencyUnit: z.number().int().min(0).max(10000),
  timezone: z.enum(SETTINGS_TIMEZONES),
  phone: z
    .string()
    .regex(/^\d{10,11}$/)
    .nullable(),
  email: z.email().nullable(),
});

type SchemaField = keyof z.infer<typeof SettingsFormSchema>;

const FIELD_ERROR_KEYS: Record<SchemaField, string> = {
  name: 'errors.nameRequired',
  cancellationWindowHours: 'errors.cancellationWindowMax',
  serviceBufferMinutes: 'errors.bufferMax',
  loyaltyExpiryDays: 'errors.expiryRange',
  pointsPerCurrencyUnit: 'errors.pointsMax',
  timezone: 'errors.timezoneInvalid',
  phone: 'errors.phoneInvalid',
  email: 'errors.emailInvalid',
};

export type SettingsFormTranslator = (key: string) => string;

const DEFAULT_DAY: DayHoursValue = { open: '09:00', close: '18:00', closed: true };

export function toSettingsFormValues(tenant: TenantSettingsResponse): SettingsFormValues {
  const { settings } = tenant;
  const businessInfo = settings.businessInfo;
  const address = businessInfo?.address;
  const days = Object.fromEntries(
    WEEK_DAYS.map((day) => {
      const hours = settings.businessHours[day];
      return [day, hours ? { open: hours.open, close: hours.close, closed: false } : DEFAULT_DAY];
    }),
  ) as Record<WeekDay, DayHoursValue>;

  return {
    name: tenant.name,
    cancellationWindowHours: String(settings.booking.cancellationWindowHours),
    serviceBufferMinutes: String(settings.booking.serviceBufferMinutes),
    loyaltyExpiryDays: String(settings.loyalty.expiryDays),
    pointsPerCurrencyUnit: String(settings.loyalty.pointsPerCurrencyUnit),
    timezone: settings.businessHours.timezone,
    days,
    phone: businessInfo?.phone ?? '',
    email: businessInfo?.email ?? '',
    address: {
      street: address?.street ?? '',
      number: address?.number ?? '',
      complement: address?.complement ?? '',
      neighborhood: address?.neighborhood ?? '',
      city: address?.city ?? '',
      state: address?.state ?? '',
      zipCode: address?.zipCode ?? '',
    },
  };
}

function parseIntStrict(value: string): number {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function buildBusinessHours(
  timezone: string,
  days: Record<WeekDay, DayHoursValue>,
): NonNullable<UpdateTenantSettingsRequest['settings']['businessHours']> {
  return {
    timezone,
    ...(Object.fromEntries(
      WEEK_DAYS.map((day) => {
        const value = days[day];
        return [day, value.closed ? null : { open: value.open, close: value.close }];
      }),
    ) as Record<WeekDay, { open: string; close: string } | null>),
  };
}

function buildBusinessInfo(
  phone: string | null,
  email: string | null,
  address: SettingsAddressValues,
): NonNullable<UpdateTenantSettingsRequest['settings']['businessInfo']> {
  const complement = address.complement.trim();
  return {
    phone,
    email,
    address: {
      street: trimmedOrNull(address.street),
      number: trimmedOrNull(address.number),
      // `complement` is optional (not nullable) in the BFF schema — omit when empty
      ...(complement === '' ? {} : { complement }),
      neighborhood: trimmedOrNull(address.neighborhood),
      city: trimmedOrNull(address.city),
      state: trimmedOrNull(address.state),
      zipCode: trimmedOrNull(address.zipCode),
    },
  };
}

export function validateSettingsForm(
  values: SettingsFormValues,
  t: SettingsFormTranslator,
): {
  readonly errors: SettingsFormErrors;
  readonly normalized: NormalizedSettingsForm | null;
} {
  const phoneDigits = digitsOnly(values.phone);
  const candidate = {
    name: values.name,
    cancellationWindowHours: parseIntStrict(values.cancellationWindowHours),
    serviceBufferMinutes: parseIntStrict(values.serviceBufferMinutes),
    loyaltyExpiryDays: parseIntStrict(values.loyaltyExpiryDays),
    pointsPerCurrencyUnit: parseIntStrict(values.pointsPerCurrencyUnit),
    timezone: values.timezone,
    phone: phoneDigits === '' ? null : phoneDigits,
    email: trimmedOrNull(values.email),
  };

  const result = SettingsFormSchema.safeParse(candidate);
  if (!result.success) {
    const errors: SettingsFormErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as SchemaField;
      errors[field] ??= t(FIELD_ERROR_KEYS[field]);
    }
    return { errors, normalized: null };
  }

  const parsed = result.data;
  return {
    errors: {},
    normalized: {
      name: parsed.name,
      settings: {
        booking: {
          cancellationWindowHours: parsed.cancellationWindowHours,
          serviceBufferMinutes: parsed.serviceBufferMinutes,
        },
        loyalty: {
          expiryDays: parsed.loyaltyExpiryDays,
          pointsPerCurrencyUnit: parsed.pointsPerCurrencyUnit,
        },
        businessHours: buildBusinessHours(parsed.timezone, values.days),
        businessInfo: buildBusinessInfo(parsed.phone, parsed.email, values.address),
      },
    },
  };
}
