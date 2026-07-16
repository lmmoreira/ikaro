import { z } from 'zod';
import { AddressShapeSchema } from '@ikaro/validation';

export const UpdateCustomerProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  defaultAddress: AddressShapeSchema.nullable().optional(),
});

export type UpdateCustomerProfileDto = z.infer<typeof UpdateCustomerProfileSchema>;
