import { z } from 'zod';

// Request Zod schemas and their inferred body/query types — split out of schedule.controller.ts
// so request-side shapes never live inline in the controller (mirrors
// booking/bookings.schemas.ts's existing split).
export const CreateClosureBodySchema = z.object({
  date: z.iso.date({ error: 'date must be a valid YYYY-MM-DD calendar date' }),
  reason: z.enum(['STAFF_DAY_OFF', 'MAINTENANCE', 'HOLIDAY']),
  resourceId: z.uuid().optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'startTime must be HH:MM')
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'endTime must be HH:MM')
    .optional(),
  notes: z.string().optional(),
});

export const ListClosuresQuerySchema = z.object({
  from: z.iso.date({ error: 'from must be a valid YYYY-MM-DD calendar date' }),
  to: z.iso.date({ error: 'to must be a valid YYYY-MM-DD calendar date' }),
  resourceId: z.uuid().optional(),
});

export type CreateClosureBody = z.infer<typeof CreateClosureBodySchema>;
export type ListClosuresQuery = z.infer<typeof ListClosuresQuerySchema>;
