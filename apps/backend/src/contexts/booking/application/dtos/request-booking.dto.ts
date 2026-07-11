import { z } from 'zod';
import { PhoneErrorCode } from '@ikaro/types';
import { PhoneNumber } from '../../../../shared/value-objects/phone-number.vo';
import { BookingTmpPhotoPathsSchema } from '../../../../shared/utils/tmp-path-regex';

const AddressSchema = z.object({
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().min(1).optional(),
  city: z.string().min(1),
  state: z.string().trim().min(1).max(10),
  zipCode: z.string().trim().min(1).max(20),
});

export const RequestBookingSchema = z.object({
  contactEmail: z.email(),
  contactName: z.string().min(1),
  contactPhone: z.string().refine(PhoneNumber.isValid, {
    error: 'contactPhone must be in E.164 format',
    params: { code: PhoneErrorCode.FORMAT_INVALID },
  }),
  contactAddress: AddressSchema.optional(),
  pickupAddress: AddressSchema.optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
  scheduledAt: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).min(1),
  beforeServicePhotoUrls: BookingTmpPhotoPathsSchema.optional(),
});

export type RequestBookingDto = z.infer<typeof RequestBookingSchema>;
