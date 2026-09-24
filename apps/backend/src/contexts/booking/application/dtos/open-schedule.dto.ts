import { z } from 'zod';
import { TimeOfDayErrorCode } from '@ikaro/types/protocol/errors';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';

export const OpenScheduleSchema = z
  .object({
    date: z.iso.date({ error: 'date must be a valid YYYY-MM-DD calendar date' }),
    startTime: z.string().refine(TimeOfDay.isValid, {
      error: 'startTime must be HH:MM',
      params: { code: TimeOfDayErrorCode.FORMAT_INVALID },
    }),
    endTime: z.string().refine(TimeOfDay.isValid, {
      error: 'endTime must be HH:MM',
      params: { code: TimeOfDayErrorCode.FORMAT_INVALID },
    }),
    resourceId: z.uuid().optional(),
    notes: z.string().optional(),
  })
  .strict();

export type OpenScheduleDto = z.infer<typeof OpenScheduleSchema>;

export const ListOpeningsSchema = z
  .object({
    from: z.iso.date({ error: 'from must be a valid YYYY-MM-DD calendar date' }),
    to: z.iso.date({ error: 'to must be a valid YYYY-MM-DD calendar date' }),
    resourceId: z.uuid().optional(),
  })
  .strict();

export type ListOpeningsDto = z.infer<typeof ListOpeningsSchema>;
