import { z } from 'zod';
import { CountryCodeErrorCode, GenericErrorCode } from '@ikaro/types/protocol/errors';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';

// `SELF_SIGNUP` without `googleSub` is a caller bug (400); a missing `terms` is a business refusal
// the use case raises (422 SIGNUP_TERMS_NOT_ACCEPTED), so `terms` is optional here. `countryCode`
// only picks the TaxId spec and is never stored.
export const ReserveSignupRegistrationSchema = z
  .object({
    source: z.enum(['SELF_SIGNUP', 'OPERATOR']),
    googleSub: z.string().trim().min(1).max(100).optional(),
    taxId: z.string().trim().min(1).max(32).optional(),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .refine(CountryCode.isValid, {
        error: 'countryCode must be a supported country code',
        params: { code: CountryCodeErrorCode.UNSUPPORTED },
      })
      .optional(),
    terms: z.object({ version: z.string().trim().min(1).max(20) }).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.source === 'SELF_SIGNUP' && value.googleSub === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['googleSub'],
        message: 'googleSub is required for SELF_SIGNUP',
        params: { code: GenericErrorCode.FIELD_REQUIRED },
      });
    }
    if (value.taxId !== undefined && value.countryCode === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['countryCode'],
        message: 'countryCode is required with taxId',
        params: { code: GenericErrorCode.FIELD_REQUIRED },
      });
    }
  });

export type ReserveSignupRegistrationDto = z.infer<typeof ReserveSignupRegistrationSchema>;
