import { z } from 'zod';
import { BookingStatus } from '../../domain/booking.aggregate';

const BookingStatusEnum = z.enum([
  BookingStatus.PENDING,
  BookingStatus.INFO_REQUESTED,
  BookingStatus.APPROVED,
  BookingStatus.COMPLETED,
  BookingStatus.REJECTED,
  BookingStatus.CANCELLED,
]);

export const ListBookingsSchema = z.object({
  // Accepts a single value ("PENDING") or comma-separated list ("PENDING,INFO_REQUESTED").
  // After parsing, dto.status is BookingStatus[].
  status: z
    .string()
    .transform((val) => val.split(',').map((s) => s.trim()))
    .pipe(z.array(BookingStatusEnum).min(1))
    .optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListBookingsDto = z.infer<typeof ListBookingsSchema>;
