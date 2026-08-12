import { z } from 'zod';
import { EmailErrorCode, SlugErrorCode, TimezoneErrorCode } from '@ikaro/types/protocol/errors';
import { Email } from '../../../../shared/value-objects/email.vo';
import { Slug } from '../../../../shared/value-objects/slug.vo';
import { Timezone } from '../../../../shared/value-objects/timezone.vo';
import { CountryCodeSchema } from './country-code.schema';

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
