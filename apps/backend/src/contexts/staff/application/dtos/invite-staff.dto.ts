import { z } from 'zod';

// HTTP request body — tenantId and invitedBy come from TenantContext in the controller
export const InviteStaffSchema = z.object({
  email: z.email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['MANAGER', 'STAFF']),
});

export type InviteStaffBodyDto = z.infer<typeof InviteStaffSchema>;

// Full input type passed to the use case (includes fields from TenantContext)
export interface InviteStaffDto {
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'MANAGER' | 'STAFF';
  invitedBy: string;
}
