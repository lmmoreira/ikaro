import { z } from 'zod';
import { Email } from '../../../../shared/value-objects/email.vo';
import { Slug } from '../../../../shared/value-objects/slug.vo';
import { Timezone } from '../../../../shared/value-objects/timezone.vo';

export const ProvisionTenantSchema = z.object({
  name: z.string().min(1, { message: 'name must not be empty' }),
  slug: z.string().refine(Slug.isValid, {
    message: 'slug must only contain lowercase letters, numbers, and hyphens',
  }),
  adminEmail: z.string().refine(Email.isValid, { message: 'adminEmail must be a valid email' }),
  country_code: z
    .string()
    .regex(/^[A-Za-z]{2}$/, { message: 'country_code must be a 2-letter ISO 3166-1 alpha-2 code' })
    .toUpperCase(),
  timezone: z
    .string()
    .refine(Timezone.isValid, { message: 'timezone must be a valid IANA timezone' })
    .optional(),
});

export type ProvisionTenantDto = z.infer<typeof ProvisionTenantSchema>;
