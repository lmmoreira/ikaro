import { z } from 'zod';
import { DATE_ONLY_PATTERN } from '@ikaro/validation';

export const GetScheduleDayGridSchema = z.object({
  date: z.string().regex(DATE_ONLY_PATTERN, 'date must be YYYY-MM-DD'),
});

export type GetScheduleDayGridDto = z.infer<typeof GetScheduleDayGridSchema>;
