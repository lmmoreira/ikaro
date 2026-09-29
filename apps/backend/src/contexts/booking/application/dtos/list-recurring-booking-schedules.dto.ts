import { z } from 'zod';
import { ListRecurringBookingSchedulesQuerySchema as ListRecurringBookingSchedulesSchema } from '@ikaro/validation';

// Shared with the BFF query schema (packages/validation/src/booking.ts) — same params, one
// definition (bad-smell-audit BFF-5).
export { ListRecurringBookingSchedulesSchema };

export type ListRecurringBookingSchedulesDto = z.infer<typeof ListRecurringBookingSchedulesSchema>;
