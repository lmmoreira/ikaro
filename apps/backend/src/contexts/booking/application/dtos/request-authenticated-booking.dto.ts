import { z } from 'zod';
import {
  AddressShapeSchema,
  BookingAttendeeInputSchema,
  BookingIntakeAnswersSchema,
  ResourceSelectionSchema,
} from '@ikaro/validation';
import { BookingTmpPhotoPathsSchema } from '../../../../shared/utils/tmp-path-regex';

export const RequestAuthenticatedBookingSchema = z.object({
  scheduledAt: z.iso.datetime(),
  // Bound — see request-booking.dto.ts's identical comment.
  serviceIds: z.array(z.uuid()).min(1).max(20),
  pickupAddress: AddressShapeSchema.optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
  beforeServicePhotoUrls: BookingTmpPhotoPathsSchema.optional(),
  // CUSTOMER_CHOICE picks — see request-booking.dto.ts's identical comment.
  resourceSelections: z.array(ResourceSelectionSchema).max(100).optional(),
  // M23-S02 (UC-067/UC-068) — see request-booking.dto.ts's identical fields for semantics.
  durationMinutes: z.number().int().positive().optional(),
  participantCount: z.number().int().positive().optional(),
  intakeSchemaVersion: z.number().int().positive().optional(),
  intakeAnswers: BookingIntakeAnswersSchema.optional(),
  consentAccepted: z.boolean().optional(),
  attendees: z.array(BookingAttendeeInputSchema).max(50).optional(),
});

export type RequestAuthenticatedBookingDto = z.infer<typeof RequestAuthenticatedBookingSchema>;
