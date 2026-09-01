import { z } from 'zod';
import { ResourceType } from '../../domain/resource.types';

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

export const CreateResourceSchema = z
  .object({
    type: z.enum([ResourceType.STAFF, ResourceType.ROOM, ResourceType.EQUIPMENT]),
    refId: z.uuid().optional(),
    name: z.string().min(1),
    workingHours: WorkingHoursSchema.nullable().optional(),
    turnoverMinutes: z.number().int().min(0).optional(),
    maxCapacity: z.number().int().positive().nullable().optional(),
  })
  .strict();

export type CreateResourceDto = z.infer<typeof CreateResourceSchema>;

export const UpdateResourceWorkingHoursSchema = z
  .object({
    workingHours: WorkingHoursSchema.nullable(),
  })
  .strict();

export type UpdateResourceWorkingHoursDto = z.infer<typeof UpdateResourceWorkingHoursSchema>;

export const ListResourcesSchema = z.object({
  type: z
    .enum([ResourceType.LOCATION, ResourceType.STAFF, ResourceType.ROOM, ResourceType.EQUIPMENT])
    .optional(),
  // .optional() must come AFTER .transform() — chaining it before wraps the schema in
  // ZodEffects, which z.object() no longer recognizes as an optional key, making `isActive`
  // a required `boolean | undefined` property instead of a genuinely optional one.
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListResourcesDto = z.infer<typeof ListResourcesSchema>;
