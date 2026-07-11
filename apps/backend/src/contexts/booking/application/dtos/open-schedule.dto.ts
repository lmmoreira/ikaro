import { z } from 'zod';
import { TimeOfDayErrorCode } from '@ikaro/types';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';

export const OpenScheduleSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    startTime: z.string().refine(TimeOfDay.isValid, {
      error: 'startTime must be HH:MM',
      params: { code: TimeOfDayErrorCode.FORMAT_INVALID },
    }),
    endTime: z.string().refine(TimeOfDay.isValid, {
      error: 'endTime must be HH:MM',
      params: { code: TimeOfDayErrorCode.FORMAT_INVALID },
    }),
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
