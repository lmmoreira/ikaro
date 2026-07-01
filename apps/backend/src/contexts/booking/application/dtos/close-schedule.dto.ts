import { z } from 'zod';
import { ClosureReason } from '../../domain/schedule-closure.aggregate';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';

export const CloseScheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  reason: z.enum([ClosureReason.STAFF_DAY_OFF, ClosureReason.MAINTENANCE, ClosureReason.HOLIDAY]),
  startTime: z
    .string()
    .refine(TimeOfDay.isValid, { message: 'startTime must be HH:MM' })
    .optional(),
  endTime: z.string().refine(TimeOfDay.isValid, { message: 'endTime must be HH:MM' }).optional(),
  notes: z.string().optional(),
});

export type CloseScheduleDto = z.infer<typeof CloseScheduleSchema>;

export const ListClosuresSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
});

export type ListClosuresDto = z.infer<typeof ListClosuresSchema>;
