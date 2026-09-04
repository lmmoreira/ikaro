import { z } from 'zod';
import { TimeOfDayErrorCode } from '@ikaro/types/protocol/errors';
import { DATE_ONLY_PATTERN } from '@ikaro/validation';
import { ClosureReason } from '../../domain/schedule-closure.aggregate';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';

export const CloseScheduleSchema = z.object({
  date: z.string().regex(DATE_ONLY_PATTERN, 'date must be YYYY-MM-DD'),
  reason: z.enum([ClosureReason.STAFF_DAY_OFF, ClosureReason.MAINTENANCE, ClosureReason.HOLIDAY]),
  resourceId: z.uuid().optional(),
  startTime: z
    .string()
    .refine(TimeOfDay.isValid, {
      error: 'startTime must be HH:MM',
      params: { code: TimeOfDayErrorCode.FORMAT_INVALID },
    })
    .optional(),
  endTime: z
    .string()
    .refine(TimeOfDay.isValid, {
      error: 'endTime must be HH:MM',
      params: { code: TimeOfDayErrorCode.FORMAT_INVALID },
    })
    .optional(),
  notes: z.string().optional(),
});

export type CloseScheduleDto = z.infer<typeof CloseScheduleSchema>;

export const ListClosuresSchema = z.object({
  from: z.string().regex(DATE_ONLY_PATTERN, 'from must be YYYY-MM-DD'),
  to: z.string().regex(DATE_ONLY_PATTERN, 'to must be YYYY-MM-DD'),
  resourceId: z.uuid().optional(),
});

export type ListClosuresDto = z.infer<typeof ListClosuresSchema>;
