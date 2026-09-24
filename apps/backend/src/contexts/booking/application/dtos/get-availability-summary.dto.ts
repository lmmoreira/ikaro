import { z } from 'zod';

export const GetAvailabilitySummarySchema = z.object({
  from: z.iso.date({ error: 'from must be a valid YYYY-MM-DD calendar date' }),
  to: z.iso.date({ error: 'to must be a valid YYYY-MM-DD calendar date' }),
  serviceIds: z
    .string()
    .transform((s) => s.split(','))
    .pipe(z.array(z.uuid()).min(1, 'at least one serviceId is required')),
  // Optional — omit for tenant-wide availability (today's behavior, unchanged). When set, scopes
  // the calculation to that resource's own closures/openings/workingHours.
  resourceId: z.uuid().optional(),
});

export type GetAvailabilitySummaryDto = z.infer<typeof GetAvailabilitySummarySchema>;
