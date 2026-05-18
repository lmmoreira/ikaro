import { z } from 'zod';

export const FindOrCreateCustomerSchema = z.object({
  tenantId: z.uuid(),
  googleOAuthId: z.string().min(1, { message: 'googleOAuthId must not be empty' }),
  email: z.string().min(1, { message: 'email must not be empty' }),
  name: z.string().min(1, { message: 'name must not be empty' }),
});

export type FindOrCreateCustomerDto = z.infer<typeof FindOrCreateCustomerSchema>;
