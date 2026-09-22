import { z } from 'zod';
import { DATE_ONLY_PATTERN } from '@ikaro/validation';

export const GetAvailabilitySchema = z.object({
  date: z.string().regex(DATE_ONLY_PATTERN, 'date must be YYYY-MM-DD'),
  serviceIds: z
    .string()
    .transform((s) => s.split(','))
    .pipe(z.array(z.uuid()).min(1, 'at least one serviceId is required')),
  // Optional — omit for tenant-wide availability (today's behavior, unchanged). When set, scopes
  // the calculation to that resource's own closures/openings/workingHours.
  resourceId: z.uuid().optional(),
});

export type GetAvailabilityDto = z.infer<typeof GetAvailabilitySchema>;
