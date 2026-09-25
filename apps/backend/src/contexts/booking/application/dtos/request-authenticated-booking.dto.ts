import { z } from 'zod';
import { AddressShapeSchema, ResourceSelectionSchema } from '@ikaro/validation';
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
});

export type RequestAuthenticatedBookingDto = z.infer<typeof RequestAuthenticatedBookingSchema>;
