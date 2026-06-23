import { z } from 'zod';

export const RenameTenantSchema = z.object({
  name: z.string().trim().min(1, 'name must not be empty'),
});

export type RenameTenantDto = z.infer<typeof RenameTenantSchema>;
