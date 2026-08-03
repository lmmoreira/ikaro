import { z } from 'zod';
import { DATE_ONLY_PATTERN } from '@ikaro/validation';

export const GetAvailabilitySummarySchema = z.object({
  from: z.string().regex(DATE_ONLY_PATTERN, 'from must be YYYY-MM-DD'),
  to: z.string().regex(DATE_ONLY_PATTERN, 'to must be YYYY-MM-DD'),
  serviceIds: z
    .string()
    .transform((s) => s.split(','))
    .pipe(z.array(z.uuid()).min(1, 'at least one serviceId is required')),
});

export type GetAvailabilitySummaryDto = z.infer<typeof GetAvailabilitySummarySchema>;
