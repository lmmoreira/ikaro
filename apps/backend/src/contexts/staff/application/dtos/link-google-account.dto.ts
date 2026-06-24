import { z } from 'zod';

export const LinkGoogleAccountSchema = z.object({
  tenantId: z.uuid(),
  googleOAuthId: z.string().min(1).max(255),
  email: z.email().max(255),
  name: z.string().min(1).max(255),
});

export type LinkGoogleAccountDto = z.infer<typeof LinkGoogleAccountSchema>;
