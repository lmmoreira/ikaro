import { z } from 'zod';

export const RenameTenantSchema = z.object({
  name: z.string().min(1, 'name must not be empty'),
});

export type RenameTenantDto = z.infer<typeof RenameTenantSchema>;
