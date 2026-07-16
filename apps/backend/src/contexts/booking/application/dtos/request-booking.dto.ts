import { z } from 'zod';
import { PhoneErrorCode } from '@ikaro/types';
import { AddressShapeSchema } from '@ikaro/validation';
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
  serviceIds: z.array(z.uuid()).min(1),
  beforeServicePhotoUrls: BookingTmpPhotoPathsSchema.optional(),
});

export type RequestBookingDto = z.infer<typeof RequestBookingSchema>;
