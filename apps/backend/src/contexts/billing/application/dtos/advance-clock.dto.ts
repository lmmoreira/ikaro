import { z } from 'zod';
import { GenericErrorCode } from '@ikaro/types';

// Non-negative integers: `multipleOf(1)` (not `.int()`) so a fractional value derives
// GENERIC_VALUE_OUT_OF_RANGE like a negative one, instead of GENERIC_VALUE_INVALID.
const wholeCount = z.number().min(0).multipleOf(1);

export const AdvanceClockSchema = z
  .object({
    days: wholeCount.optional(),
    hours: wholeCount.optional(),
  })
  .refine((value) => (value.days ?? 0) + (value.hours ?? 0) > 0, {
    path: ['days'],
    params: { code: GenericErrorCode.VALUE_OUT_OF_RANGE },
    message: 'days or hours must add up to more than zero',
  });

export type AdvanceClockDto = z.infer<typeof AdvanceClockSchema>;
