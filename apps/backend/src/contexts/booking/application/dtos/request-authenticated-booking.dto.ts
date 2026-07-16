import { z } from 'zod';
import { AddressShapeSchema } from '@ikaro/validation';
import { BookingTmpPhotoPathsSchema } from '../../../../shared/utils/tmp-path-regex';

export const RequestAuthenticatedBookingSchema = z.object({
  scheduledAt: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).min(1),
  pickupAddress: AddressShapeSchema.optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
  beforeServicePhotoUrls: BookingTmpPhotoPathsSchema.optional(),
});

export type RequestAuthenticatedBookingDto = z.infer<typeof RequestAuthenticatedBookingSchema>;
