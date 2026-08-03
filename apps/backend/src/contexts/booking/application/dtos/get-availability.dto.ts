import { z } from 'zod';
import { DATE_ONLY_PATTERN } from '@ikaro/validation';

export const GetAvailabilitySchema = z.object({
  date: z.string().regex(DATE_ONLY_PATTERN, 'date must be YYYY-MM-DD'),
  serviceIds: z
    .string()
    .transform((s) => s.split(','))
    .pipe(z.array(z.uuid()).min(1, 'at least one serviceId is required')),
});

export type GetAvailabilityDto = z.infer<typeof GetAvailabilitySchema>;
