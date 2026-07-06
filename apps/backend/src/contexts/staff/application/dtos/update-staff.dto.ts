import { z } from 'zod';

// HTTP request body only — tenantId comes from RequestContext in the controller
export const UpdateStaffSchema = z.object({
  name: z.string().min(1),
  role: z.enum(['MANAGER', 'STAFF']),
});

export type UpdateStaffBodyDto = z.infer<typeof UpdateStaffSchema>;
