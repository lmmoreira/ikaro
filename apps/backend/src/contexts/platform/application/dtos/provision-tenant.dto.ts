import { z } from 'zod';
import {
  CountryCodeErrorCode,
  EmailErrorCode,
  SlugErrorCode,
  TimezoneErrorCode,
} from '@ikaro/types';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { Email } from '../../../../shared/value-objects/email.vo';
import { Slug } from '../../../../shared/value-objects/slug.vo';
import { Timezone } from '../../../../shared/value-objects/timezone.vo';

const CountryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, {
    message: 'country_code must be a 2-letter ISO 3166-1 alpha-2 code',
  })
  .toUpperCase()
  .refine(CountryCode.isValid, {
    error: 'country_code must be a supported country code',
    params: { code: CountryCodeErrorCode.UNSUPPORTED },
  });

export const ProvisionTenantSchema = z.object({
  name: z.string().min(1, { message: 'name must not be empty' }),
  slug: z.string().refine(Slug.isValid, {
    error: 'slug must only contain lowercase letters, numbers, and hyphens',
    params: { code: SlugErrorCode.FORMAT_INVALID },
  }),
  adminEmail: z.string().refine(Email.isValid, {
    error: 'adminEmail must be a valid email',
    params: { code: EmailErrorCode.FORMAT_INVALID },
  }),
  country_code: CountryCodeSchema,
  timezone: z
    .string()
    .refine(Timezone.isValid, {
      error: 'timezone must be a valid IANA timezone',
      params: { code: TimezoneErrorCode.INVALID },
    })
    .optional(),
});

export type ProvisionTenantDto = z.infer<typeof ProvisionTenantSchema>;
