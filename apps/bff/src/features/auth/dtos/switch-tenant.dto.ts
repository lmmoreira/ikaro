import { z } from 'zod';

export const SwitchTenantSchema = z.object({
  targetTenantId: z.uuid(),
});

export type SwitchTenantDto = z.infer<typeof SwitchTenantSchema>;
