import { z } from 'zod';

const AddressSchema = z.object({
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().min(1).optional(),
  city: z.string().min(1),
  state: z.string().trim().min(1).max(10),
  zipCode: z.string().trim().min(1).max(20),
});

export const RequestAuthenticatedBookingSchema = z.object({
  scheduledAt: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).min(1),
  pickupAddress: AddressSchema.optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
  // Uploads always target tmp/ staging (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md) — promotion to
  // tenants/<id>/bookings/<bookingId>/... happens server-side once the booking is saved.
  beforeServicePhotoUrls: z.array(z.string().regex(/^tmp\/[^/]+\/[^/]+\/.+$/)).optional(),
});

export type RequestAuthenticatedBookingDto = z.infer<typeof RequestAuthenticatedBookingSchema>;
