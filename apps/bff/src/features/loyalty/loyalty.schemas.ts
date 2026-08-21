import { z } from 'zod';

// Request Zod schemas and their inferred body/query types — split out of loyalty.controller.ts
// so request-side shapes never live inline in the controller (TD37-S10, mirrors
// booking/bookings.schemas.ts's existing split).
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof PaginationSchema>;

export const RedeemPointsSchema = z.object({
  customerId: z.uuid(),
  pointsToRedeem: z.number().int().min(1),
  notes: z.string().optional().nullable(),
  bookingId: z.uuid().optional().nullable(),
});

export type RedeemPointsBody = z.infer<typeof RedeemPointsSchema>;
