import { z } from 'zod';
import { BookingStatus } from '../../domain/booking.aggregate';

export const ListBookingsSchema = z.object({
  status: z
    .enum([
      BookingStatus.PENDING,
      BookingStatus.INFO_REQUESTED,
      BookingStatus.APPROVED,
      BookingStatus.COMPLETED,
      BookingStatus.REJECTED,
      BookingStatus.CANCELLED,
    ])
    .optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListBookingsDto = z.infer<typeof ListBookingsSchema>;
