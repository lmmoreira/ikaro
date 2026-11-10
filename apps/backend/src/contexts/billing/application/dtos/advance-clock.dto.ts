import { z } from 'zod';
import { GenericErrorCode } from '@ikaro/types';

// Non-negative integers: `multipleOf(1)` (not `.int()`) so a fractional value derives
// GENERIC_VALUE_OUT_OF_RANGE like a negative one, instead of GENERIC_VALUE_INVALID.
// Each bound equals the dev clock's whole 100-year cap (MAX_CLOCK_OFFSET_MS), so one request can
// never ask for more than the clock accepts; the cumulative cap is enforced by the clock itself.
const wholeCount = (max: number) => z.number().min(0).max(max).multipleOf(1);

export const AdvanceClockSchema = z
  .object({
    days: wholeCount(36_500).optional(),
    hours: wholeCount(876_000).optional(),
  })
  .refine((value) => (value.days ?? 0) + (value.hours ?? 0) > 0, {
    path: ['days'],
    params: { code: GenericErrorCode.VALUE_OUT_OF_RANGE },
    message: 'days or hours must add up to more than zero',
  });

export type AdvanceClockDto = z.infer<typeof AdvanceClockSchema>;
