import { z } from 'zod';
import { EmailErrorCode } from '@ikaro/types/protocol/errors';
import { Email } from '../../../../shared/value-objects/email.vo';
import { CountryCodeSchema } from '../../../../shared/schemas/country-code.schema';

// Shape only (the BFF sends already-shaped values): the slug is deliberately a plain string here,
// because its format verdict is the policy's (`SIGNUP_SLUG_INVALID`, 422), not a Zod 400.
export const ValidateSignupSchema = z.object({
  slug: z.string().max(100),
  turnstileToken: z.string().min(1).max(4096),
  clientIp: z.string().min(1).max(64),
});
export type ValidateSignupDto = z.infer<typeof ValidateSignupSchema>;

export const SignupTenantSchema = z.object({
  name: z.string().trim().min(1, { message: 'name must not be empty' }).max(120),
  slug: z.string().max(100),
  adminEmail: z.string().refine(Email.isValid, {
    error: 'adminEmail must be a valid email',
    params: { code: EmailErrorCode.FORMAT_INVALID },
  }),
  countryCode: CountryCodeSchema,
  registrationId: z.uuid({ message: 'registrationId must be a UUID' }),
});
export type SignupTenantDto = z.infer<typeof SignupTenantSchema>;
