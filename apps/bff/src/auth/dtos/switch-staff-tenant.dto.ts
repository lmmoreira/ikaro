import { z } from 'zod';

export const SwitchStaffTenantSchema = z.object({
  staffId: z.uuid(),
});

export type SwitchStaffTenantDto = z.infer<typeof SwitchStaffTenantSchema>;
