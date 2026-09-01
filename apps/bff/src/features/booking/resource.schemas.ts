import { z } from 'zod';

// Request Zod schemas and their inferred body/query types — split out of resource.controller.ts
// so request-side shapes never live inline in the controller (mirrors schedule-opening.schemas.ts).
const DayHoursSchema = z
  .object({
    open: z.string().regex(/^\d{2}:\d{2}$/, 'open must be HH:MM'),
    close: z.string().regex(/^\d{2}:\d{2}$/, 'close must be HH:MM'),
  })
  .nullable();

const WorkingHoursSchema = z.object({
  monday: DayHoursSchema,
  tuesday: DayHoursSchema,
  wednesday: DayHoursSchema,
  thursday: DayHoursSchema,
  friday: DayHoursSchema,
  saturday: DayHoursSchema,
  sunday: DayHoursSchema,
});

export const CreateResourceBodySchema = z
  .object({
    type: z.enum(['STAFF', 'ROOM', 'EQUIPMENT']),
    refId: z.uuid().optional(),
    name: z.string().min(1),
    workingHours: WorkingHoursSchema.nullable().optional(),
    turnoverMinutes: z.number().int().min(0).optional(),
    maxCapacity: z.number().int().positive().nullable().optional(),
  })
  .strict();

export const UpdateResourceWorkingHoursBodySchema = z
  .object({
    workingHours: WorkingHoursSchema.nullable(),
  })
  .strict();

export const ListResourcesQuerySchema = z.object({
  type: z.enum(['LOCATION', 'STAFF', 'ROOM', 'EQUIPMENT']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export type CreateResourceBody = z.infer<typeof CreateResourceBodySchema>;
export type UpdateResourceWorkingHoursBody = z.infer<typeof UpdateResourceWorkingHoursBodySchema>;
export type ListResourcesQuery = z.infer<typeof ListResourcesQuerySchema>;
