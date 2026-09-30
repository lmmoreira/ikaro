import { z } from 'zod';
import { CorrectBookingNoShowSchema } from '@ikaro/validation';

// UC-074 A3 — shared with the BFF body schema (packages/validation/src/booking.ts).
export { CorrectBookingNoShowSchema };

export type CorrectBookingNoShowDto = z.infer<typeof CorrectBookingNoShowSchema>;
