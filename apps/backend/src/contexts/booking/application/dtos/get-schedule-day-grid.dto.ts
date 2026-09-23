import { z } from 'zod';
import { ScheduleDayGridQuerySchema } from '@ikaro/validation';

// Shared verbatim with the BFF's GetDayGridQuerySchema — see @ikaro/validation booking.ts.
export const GetScheduleDayGridSchema = ScheduleDayGridQuerySchema;

export type GetScheduleDayGridDto = z.infer<typeof GetScheduleDayGridSchema>;
