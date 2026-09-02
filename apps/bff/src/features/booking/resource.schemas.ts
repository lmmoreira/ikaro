import { z } from 'zod';
import {
  CreateResourceSchema as CreateResourceBodySchema,
  UpdateResourceSchema as UpdateResourceBodySchema,
} from '@ikaro/validation';

// Request Zod schemas and their inferred body/query types — split out of resource.controller.ts
// so request-side shapes never live inline in the controller (mirrors schedule-opening.schemas.ts).
// CreateResourceBodySchema/UpdateResourceBodySchema are shared with the backend's identical
// resource.dto.ts schemas via @ikaro/validation (no per-app deviation — mirrors
// HotsiteModuleSchema's direct-reuse pattern).
export { CreateResourceBodySchema, UpdateResourceBodySchema };

export const ListResourcesQuerySchema = z.object({
  type: z.enum(['LOCATION', 'STAFF', 'ROOM', 'EQUIPMENT']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export const StaffOptionsQuerySchema = z.object({
  excludeResourceId: z.uuid().optional(),
});

export type CreateResourceBody = z.infer<typeof CreateResourceBodySchema>;
export type UpdateResourceBody = z.infer<typeof UpdateResourceBodySchema>;
export type ListResourcesQuery = z.infer<typeof ListResourcesQuerySchema>;
export type StaffOptionsQuery = z.infer<typeof StaffOptionsQuerySchema>;
