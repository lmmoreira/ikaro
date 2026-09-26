import { z } from 'zod';
import { PhoneErrorCode } from '@ikaro/types/protocol/errors';
import {
  AddressShapeSchema,
  BookingAttendeeInputSchema,
  BookingIntakeAnswersSchema,
  ResourceSelectionSchema,
} from '@ikaro/validation';
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
  // M23-S02 (UC-067) — required only when the basket includes a durationPolicy=CUSTOMER_SELECTED
  // service (domain-level 422, not a Zod-level requirement — see BookingQuoteService); ignored
  // otherwise.
  durationMinutes: z.number().int().positive().optional(),
  // M23-S02 (UC-067/UC-068) — capacity input for a variable-duration service and/or a required
  // answer for an intake schema with participantCountRequired=true.
  participantCount: z.number().int().positive().optional(),
  // M23-S02 (UC-068) — required only when the basket includes a service with an active
  // service_booking_intake_schema; ignored otherwise (silently, for a service with none at all).
  intakeSchemaVersion: z.number().int().positive().optional(),
  intakeAnswers: BookingIntakeAnswersSchema.optional(),
  consentAccepted: z.boolean().optional(),
  attendees: z.array(BookingAttendeeInputSchema).max(50).optional(),
});

export type RequestBookingDto = z.infer<typeof RequestBookingSchema>;
