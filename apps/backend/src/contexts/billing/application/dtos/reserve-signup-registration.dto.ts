import { z } from 'zod';
import { GenericErrorCode } from '@ikaro/types/protocol/errors';
import { CountryCodeSchema } from '../../../../shared/schemas/country-code.schema';

// `SELF_SIGNUP` without `googleSub` is a caller bug (400); a missing `terms` is a business refusal
// the use case raises (422 SIGNUP_TERMS_NOT_ACCEPTED), so `terms` is optional here. `countryCode`
// only picks the TaxId spec and is never stored.
export const ReserveSignupRegistrationSchema = z
  .object({
    source: z.enum(['SELF_SIGNUP', 'OPERATOR']),
    googleSub: z.string().trim().min(1).max(100).optional(),
    taxId: z.string().trim().min(1).max(32).optional(),
    countryCode: CountryCodeSchema.optional(),
    terms: z.object({ version: z.string().trim().min(1).max(20) }).optional(),
    // Operator-only: the tenant to be is provisioned free of charge (UC-137).
    exempt: z.boolean().optional(),
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
    if (value.source === 'SELF_SIGNUP' && value.exempt === true) {
      ctx.addIssue({
        code: 'custom',
        path: ['exempt'],
        message: 'exempt is only allowed for OPERATOR',
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
