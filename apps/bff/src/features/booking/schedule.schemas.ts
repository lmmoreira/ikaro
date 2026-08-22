import { z } from 'zod';
import { DATE_ONLY_PATTERN } from '@ikaro/validation';

// Request Zod schemas and their inferred body/query types — split out of schedule.controller.ts
// so request-side shapes never live inline in the controller (mirrors
// booking/bookings.schemas.ts's existing split).
export const CreateClosureBodySchema = z.object({
  date: z.string().regex(DATE_ONLY_PATTERN, 'date must be YYYY-MM-DD'),
  reason: z.enum(['STAFF_DAY_OFF', 'MAINTENANCE', 'HOLIDAY']),
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
  from: z.string().regex(DATE_ONLY_PATTERN, 'from must be YYYY-MM-DD'),
  to: z.string().regex(DATE_ONLY_PATTERN, 'to must be YYYY-MM-DD'),
});

export type CreateClosureBody = z.infer<typeof CreateClosureBodySchema>;
export type ListClosuresQuery = z.infer<typeof ListClosuresQuerySchema>;
