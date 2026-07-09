import { z } from 'zod';
import { PhoneNumber } from '../../../../shared/value-objects/phone-number.vo';

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
    message: 'contactPhone must be in E.164 format',
  }),
  contactAddress: AddressSchema.optional(),
  pickupAddress: AddressSchema.optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
  scheduledAt: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).min(1),
  // Uploads always target tmp/ staging (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md) — promotion to
  // tenants/<id>/bookings/<bookingId>/... happens server-side once the booking is saved.
  beforeServicePhotoUrls: z.array(z.string().regex(/^tmp\/[^/]+\/[^/]+\/.+$/)).optional(),
});

export type RequestBookingDto = z.infer<typeof RequestBookingSchema>;
