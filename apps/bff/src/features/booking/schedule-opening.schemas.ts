import { z } from 'zod';
import { DATE_ONLY_PATTERN } from '@ikaro/validation';

// Request Zod schemas and their inferred body/query types — split out of
// schedule-opening.controller.ts so request-side shapes never live inline in the controller
// (TD37-S10, mirrors booking/bookings.schemas.ts's existing split).
export const CreateOpeningBodySchema = z.object({
  date: z.string().regex(DATE_ONLY_PATTERN, 'date must be YYYY-MM-DD'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'endTime must be HH:MM'),
  notes: z.string().optional(),
});

export const ListOpeningsQuerySchema = z.object({
  from: z.string().regex(DATE_ONLY_PATTERN, 'from must be YYYY-MM-DD'),
  to: z.string().regex(DATE_ONLY_PATTERN, 'to must be YYYY-MM-DD'),
});

export type CreateOpeningBody = z.infer<typeof CreateOpeningBodySchema>;
export type ListOpeningsQuery = z.infer<typeof ListOpeningsQuerySchema>;
