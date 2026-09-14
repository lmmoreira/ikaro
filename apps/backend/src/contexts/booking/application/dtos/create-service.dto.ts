import { z } from 'zod';
import { ClassResourceSlotSchema } from './resource-requirement.dto';

export const CreateServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceAmount: z.number().positive(),
  durationMinutes: z.number().int().positive(),
  loyaltyPointsValue: z.number().int().min(0),
  requiresPickupAddress: z.boolean().optional(),
  isActive: z.boolean().optional(),
  bookingModel: z.enum(['APPOINTMENT', 'SESSION']).optional(),
  // Only meaningful when bookingModel = 'SESSION' — inert this milestone (UC-056 step 3).
  classResourceSlots: z.array(ClassResourceSlotSchema).optional(),
});

export type CreateServiceDto = z.infer<typeof CreateServiceSchema>;
