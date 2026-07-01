import { z } from 'zod';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';

export const OpenScheduleSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    startTime: z.string().refine(TimeOfDay.isValid, { message: 'startTime must be HH:MM' }),
    endTime: z.string().refine(TimeOfDay.isValid, { message: 'endTime must be HH:MM' }),
    notes: z.string().optional(),
  })
  .strict();

export type OpenScheduleDto = z.infer<typeof OpenScheduleSchema>;

export const ListOpeningsSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
  })
  .strict();

export type ListOpeningsDto = z.infer<typeof ListOpeningsSchema>;
