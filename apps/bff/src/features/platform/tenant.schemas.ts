import { z } from 'zod';

// Request Zod schema and its inferred body type — split out of tenant.controller.ts so
// request-side shapes never live inline in the controller (TD37-S10, mirrors
// booking/bookings.schemas.ts's existing split).
export const RenameTenantBodySchema = z.object({
  name: z.string().trim().min(1, 'name must not be empty'),
});

export type RenameTenantBody = z.infer<typeof RenameTenantBodySchema>;
