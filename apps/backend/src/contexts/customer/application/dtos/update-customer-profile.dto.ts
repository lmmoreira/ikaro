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

export const UpdateCustomerProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  defaultAddress: AddressSchema.nullable().optional(),
});

export type UpdateCustomerProfileDto = z.infer<typeof UpdateCustomerProfileSchema>;
