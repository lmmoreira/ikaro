import { z } from 'zod';
import { PhoneErrorCode } from '@ikaro/types/protocol/errors';
import { AddressShapeSchema, ResourceSelectionSchema } from '@ikaro/validation';
import { PhoneNumber } from '../../../../shared/value-objects/phone-number.vo';
import { BookingTmpPhotoPathsSchema } from '../../../../shared/utils/tmp-path-regex';

export const RequestBookingSchema = z.object({
  contactEmail: z.email(),
  contactName: z.string().min(1),
  contactPhone: z.string().refine(PhoneNumber.isValid, {
    error: 'contactPhone must be in E.164 format',
    params: { code: PhoneErrorCode.FORMAT_INVALID },
  }),
  contactAddress: AddressShapeSchema.optional(),
  pickupAddress: AddressShapeSchema.optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
  scheduledAt: z.iso.datetime(),
  // Bound (not a domain-tested limit — mirrors the other array-size caps added alongside this
  // story, e.g. packages/validation/src/booking.ts) — persistRequestedBooking() now locks every
  // distinct referenced Service row sequentially inside the tenant-day advisory-lock window
  // (M22-S01), so an unbounded, unauthenticated basket could otherwise serialize unrelated
  // bookings for the same tenant/day.
  serviceIds: z.array(z.uuid()).min(1).max(20),
  beforeServicePhotoUrls: BookingTmpPhotoPathsSchema.optional(),
  // CUSTOMER_CHOICE picks (M23-S01, UC-061/064/065) — bounded generously above serviceIds' own
  // cap since a bundle/legged service can need more than one entry per line.
  resourceSelections: z.array(ResourceSelectionSchema).max(100).optional(),
});

export type RequestBookingDto = z.infer<typeof RequestBookingSchema>;
