import { z } from 'zod';
import { PhoneErrorCode } from '@ikaro/types/protocol/errors';
import {
  AddressShapeSchema,
  BookingAttendeeInputSchema,
  BookingIntakeAnswersSchema,
  ResourceSelectionSchema,
} from '@ikaro/validation';
import { PhoneNumber } from '../../../../shared/value-objects/phone-number.vo';

// M23-S39 (UC-108) — the guest booking body (request-booking.dto.ts) minus
// `beforeServicePhotoUrls` (the staff flow collects no photos), plus exactly one way to say who the
// booking is for. Both shapes are strict: a body that names `customerId` *and* any contact field,
// that names neither, or that smuggles `approvedBy`/`createdByStaffId` is a 400 — the acting staff
// id comes from the request context only. See request-booking.dto.ts for the field semantics.
const bookingShape = {
  scheduledAt: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).min(1).max(20),
  pickupAddress: AddressShapeSchema.optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
  resourceSelections: z.array(ResourceSelectionSchema).max(100).optional(),
  durationMinutes: z.number().int().positive().optional(),
  participantCount: z.number().int().positive().optional(),
  intakeSchemaVersion: z.number().int().positive().optional(),
  intakeAnswers: BookingIntakeAnswersSchema.optional(),
  consentAccepted: z.boolean().optional(),
  attendees: z.array(BookingAttendeeInputSchema).max(50).optional(),
};

// A customer of this tenant — name, email, phone and default address come from the Customer row.
const ForCustomerSchema = z.strictObject({ ...bookingShape, customerId: z.uuid() });

// A person who is not in the system — a Customer needs a Google account, so staff book them as a
// guest. Name, phone and email are all required (UC-001 contact rules).
const ForGuestSchema = z.strictObject({
  ...bookingShape,
  contactEmail: z.email(),
  contactName: z.string().min(1),
  contactPhone: z.string().refine(PhoneNumber.isValid, {
    error: 'contactPhone must be in E.164 format',
    params: { code: PhoneErrorCode.FORMAT_INVALID },
  }),
  contactAddress: AddressShapeSchema.optional(),
});

export const CreateBookingByStaffSchema = z.union([ForCustomerSchema, ForGuestSchema]);

export type CreateBookingByStaffDto = z.infer<typeof CreateBookingByStaffSchema>;
