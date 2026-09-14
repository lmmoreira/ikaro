import { z } from 'zod';
import { BookingModelSchema, ClassResourceSlotSchema } from '@ikaro/validation';

export const CreateServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceAmount: z.number().positive(),
  durationMinutes: z.number().int().positive(),
  loyaltyPointsValue: z.number().int().min(0),
  requiresPickupAddress: z.boolean().optional(),
  isActive: z.boolean().optional(),
  bookingModel: BookingModelSchema.optional(),
  // Only meaningful when bookingModel = 'SESSION' — inert this milestone (UC-056 step 3).
  classResourceSlots: z.array(ClassResourceSlotSchema).optional(),
});

export type CreateServiceDto = z.infer<typeof CreateServiceSchema>;
