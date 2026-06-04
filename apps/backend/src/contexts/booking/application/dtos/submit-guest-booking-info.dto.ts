import { z } from 'zod';

export const SubmitGuestBookingInfoBodySchema = z.object({
  bookingId: z.uuid(),
  contactEmail: z.email(),
  response: z.string().trim().min(1),
  photoUrls: z.array(z.url()).optional(),
});

export type SubmitGuestBookingInfoDto = z.infer<typeof SubmitGuestBookingInfoBodySchema>;
