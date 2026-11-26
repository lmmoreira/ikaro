import { z } from 'zod';

// `GET /internal/billing/registrations/eligibility?googleSub=` (UC-127): the Google `sub` of the
// visitor whose trial eligibility the session read asks about.
export const SignupEligibilityQuerySchema = z.object({
  googleSub: z.string().trim().min(1).max(100),
});

export type SignupEligibilityQueryDto = z.infer<typeof SignupEligibilityQuerySchema>;
