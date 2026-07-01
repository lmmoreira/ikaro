import { z } from 'zod';

// HTTP request body only — tenantId, invitedBy, and correlationId come from RequestContext in the controller
export const InviteStaffSchema = z.object({
  email: z.email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['MANAGER', 'STAFF']),
});

export type InviteStaffBodyDto = z.infer<typeof InviteStaffSchema>;
