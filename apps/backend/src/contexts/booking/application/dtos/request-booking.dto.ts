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

export const RequestBookingSchema = z.object({
  contactEmail: z.email(),
  contactName: z.string().min(1),
  contactPhone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'contactPhone must be in E.164 format'),
  contactAddress: AddressSchema.optional(),
  pickupAddress: AddressSchema.optional(),
  scheduledAt: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).min(1),
  beforeServicePhotoUrls: z
    .array(z.string().regex(/^tenants\/[^/]+\/(uploads|bookings)\/[^/]+\/.+$/))
    .optional(),
});

export type RequestBookingDto = z.infer<typeof RequestBookingSchema>;
