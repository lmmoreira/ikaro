import { z } from 'zod';
import { TimeOfDayErrorCode } from '@ikaro/types/protocol/errors';
import { DATE_ONLY_PATTERN } from '@ikaro/validation';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';

export const OpenScheduleSchema = z
  .object({
    date: z.string().regex(DATE_ONLY_PATTERN, 'date must be YYYY-MM-DD'),
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
    from: z.string().regex(DATE_ONLY_PATTERN, 'from must be YYYY-MM-DD'),
    to: z.string().regex(DATE_ONLY_PATTERN, 'to must be YYYY-MM-DD'),
    resourceId: z.uuid().optional(),
  })
  .strict();

export type ListOpeningsDto = z.infer<typeof ListOpeningsSchema>;
