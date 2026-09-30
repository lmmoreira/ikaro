import { z } from 'zod';

// UC-074 A3 — COMPLETED is the only accepted target; the reason is required (10–500 characters,
// the same minimum as a rejection reason) because it is the audit trail for the correction.
export const CorrectBookingNoShowSchema = z.object({
  correctedStatus: z.literal('COMPLETED'),
  reason: z.string().trim().min(10).max(500),
});

export type CorrectBookingNoShowDto = z.infer<typeof CorrectBookingNoShowSchema>;
