import { z } from 'zod';

export const LinkGoogleAccountSchema = z.object({
  tenantId: z.uuid(),
  googleOAuthId: z.string().min(1),
  email: z.string().min(1),
  name: z.string().min(1),
});

export type LinkGoogleAccountDto = z.infer<typeof LinkGoogleAccountSchema>;
