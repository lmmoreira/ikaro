import { z } from 'zod';
import { MarkBookingNoShowSchema } from '@ikaro/validation';

// UC-074 — shared with the BFF body schema (packages/validation/src/booking.ts).
export { MarkBookingNoShowSchema };

export type MarkBookingNoShowDto = z.infer<typeof MarkBookingNoShowSchema>;
