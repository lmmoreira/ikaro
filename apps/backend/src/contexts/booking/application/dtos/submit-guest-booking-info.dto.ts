import { z } from 'zod';

export const SubmitGuestBookingInfoBodySchema = z.object({
  bookingId: z.uuid(),
  contactEmail: z.email(),
  response: z.string().trim().min(1),
  // Uploads always target tmp/ staging (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md) — promotion to
  // tenants/<id>/bookings/<bookingId>/... happens server-side once the booking is saved.
  photoUrls: z.array(z.string().regex(/^tmp\/[^/]+\/[^/]+\/.+$/)).optional(),
});

export type SubmitGuestBookingInfoDto = z.infer<typeof SubmitGuestBookingInfoBodySchema>;
