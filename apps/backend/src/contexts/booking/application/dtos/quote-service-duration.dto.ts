import { z } from 'zod';

// Optional at the HTTP boundary — a FIXED-duration service ignores it, and a CUSTOMER_SELECTED
// service with none is a domain-level 422 (BookingQuoteService), same as POST /bookings.
export const QuoteServiceDurationSchema = z.object({
  durationMinutes: z.coerce.number().int().positive().optional(),
});

export type QuoteServiceDurationDto = z.infer<typeof QuoteServiceDurationSchema>;
