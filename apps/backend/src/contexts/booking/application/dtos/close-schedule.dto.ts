import { z } from 'zod';
import { TimeOfDayErrorCode } from '@ikaro/types/protocol/errors';
import { ScheduleClosuresRangeQuerySchema } from '@ikaro/validation';
import { ClosureReason } from '../../domain/schedule-closure.aggregate';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';

export const CloseScheduleSchema = z.object({
  date: z.iso.date({ error: 'date must be a valid YYYY-MM-DD calendar date' }),
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

// Shared verbatim with the BFF's ListClosuresQuerySchema — see @ikaro/validation booking.ts.
export const ListClosuresSchema = ScheduleClosuresRangeQuerySchema;

export type ListClosuresDto = z.infer<typeof ListClosuresSchema>;
