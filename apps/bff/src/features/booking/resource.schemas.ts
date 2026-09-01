import { z } from 'zod';
import {
  CreateResourceSchema as CreateResourceBodySchema,
  UpdateResourceWorkingHoursSchema as UpdateResourceWorkingHoursBodySchema,
} from '@ikaro/validation';

// Request Zod schemas and their inferred body/query types — split out of resource.controller.ts
// so request-side shapes never live inline in the controller (mirrors schedule-opening.schemas.ts).
// CreateResourceBodySchema/UpdateResourceWorkingHoursBodySchema are shared with the backend's
// identical resource.dto.ts schemas via @ikaro/validation (no per-app deviation — mirrors
// HotsiteModuleSchema's direct-reuse pattern).
export { CreateResourceBodySchema, UpdateResourceWorkingHoursBodySchema };

export const ListResourcesQuerySchema = z.object({
  type: z.enum(['LOCATION', 'STAFF', 'ROOM', 'EQUIPMENT']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreateResourceBody = z.infer<typeof CreateResourceBodySchema>;
export type UpdateResourceWorkingHoursBody = z.infer<typeof UpdateResourceWorkingHoursBodySchema>;
export type ListResourcesQuery = z.infer<typeof ListResourcesQuerySchema>;
