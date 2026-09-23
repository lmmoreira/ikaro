import { z } from 'zod';

// Request Zod schemas and their inferred body/query types — split out of
// schedule-opening.controller.ts so request-side shapes never live inline in the controller
// (mirrors booking/bookings.schemas.ts's existing split).
export const CreateOpeningBodySchema = z.object({
  date: z.iso.date({ error: 'date must be a valid YYYY-MM-DD calendar date' }),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'endTime must be HH:MM'),
  resourceId: z.uuid().optional(),
  notes: z.string().optional(),
});

export const ListOpeningsQuerySchema = z.object({
  from: z.iso.date({ error: 'from must be a valid YYYY-MM-DD calendar date' }),
  to: z.iso.date({ error: 'to must be a valid YYYY-MM-DD calendar date' }),
  resourceId: z.uuid().optional(),
});

export type CreateOpeningBody = z.infer<typeof CreateOpeningBodySchema>;
export type ListOpeningsQuery = z.infer<typeof ListOpeningsQuerySchema>;
