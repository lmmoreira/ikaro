import { z } from 'zod';

export const GetScheduleDayGridSchema = z.object({
  date: z.iso.date({ error: 'date must be a valid YYYY-MM-DD calendar date' }),
});

export type GetScheduleDayGridDto = z.infer<typeof GetScheduleDayGridSchema>;
