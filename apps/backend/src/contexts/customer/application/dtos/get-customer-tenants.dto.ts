import { z } from 'zod';

export const GetCustomerTenantsSchema = z.object({
  googleOAuthId: z
    .string({ error: 'googleOAuthId is required' })
    .trim()
    .min(1, 'googleOAuthId is required'),
});

export type GetCustomerTenantsDto = z.infer<typeof GetCustomerTenantsSchema>;
