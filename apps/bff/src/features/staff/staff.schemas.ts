import { z } from 'zod';

// Request Zod schemas and their inferred body types — split out of staff.controller.ts so
// request-side shapes never live inline in the controller (TD37-S10, mirrors
// booking/bookings.schemas.ts's existing split).
export const InviteStaffBodySchema = z.object({
  email: z.email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['MANAGER', 'STAFF']),
});

export type InviteStaffBody = z.infer<typeof InviteStaffBodySchema>;

export const UpdateStaffBodySchema = z.object({
  name: z.string().min(1),
  role: z.enum(['MANAGER', 'STAFF']),
});

export type UpdateStaffBody = z.infer<typeof UpdateStaffBodySchema>;
