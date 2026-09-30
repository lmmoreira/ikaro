import { z } from 'zod';

// UC-074 — the reason is an optional internal note (never shown to the customer).
export const MarkBookingNoShowSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .default({});

export type MarkBookingNoShowDto = z.infer<typeof MarkBookingNoShowSchema>;
