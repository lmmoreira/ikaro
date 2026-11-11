import { z } from 'zod';
import { FEATURE_KEYS, findUnmetFeatureRequirement } from '@ikaro/validation';
import { EmailErrorCode, SlugErrorCode, TimezoneErrorCode } from '@ikaro/types/protocol/errors';
import { Email } from '../../../../shared/value-objects/email.vo';
import { Slug } from '../../../../shared/value-objects/slug.vo';
import { Timezone } from '../../../../shared/value-objects/timezone.vo';
import { CountryCodeSchema } from '../../../../shared/schemas/country-code.schema';

export const ProvisionTenantSchema = z
  .object({
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
    exempt: z.boolean().optional(),
    registrationId: z.uuid({ message: 'registrationId must be a UUID' }).optional(),
    // The same graph Billing's Subscription enforces: one helper in @ikaro/validation, so a subset
    // Billing would refuse never gets a tenant created.
    features: z
      .array(z.enum(FEATURE_KEYS))
      .min(1, { message: 'features must not be empty' })
      .refine((keys) => new Set(keys).size === keys.length, {
        message: 'features must not repeat a feature',
      })
      .refine((keys) => findUnmetFeatureRequirement(keys) === null, {
        message: 'features must include every feature its members require (see the feature graph)',
      })
      .optional(),
    taxId: z.string().optional(),
  })
  .refine((dto) => !(dto.exempt === true && dto.registrationId !== undefined), {
    message: 'an exempt tenant has no registration: send either exempt or registrationId',
    path: ['registrationId'],
  });

export type ProvisionTenantDto = z.infer<typeof ProvisionTenantSchema>;
