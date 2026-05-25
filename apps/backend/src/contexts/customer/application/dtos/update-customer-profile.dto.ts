import { z } from 'zod';

const AddressSchema = z.object({
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zipCode: z.string().regex(/^\d{5}-?\d{3}$/, 'zipCode must be 8 digits (hyphen optional)'),
});

export const UpdateCustomerProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  defaultAddress: AddressSchema.nullable().optional(),
});

export type UpdateCustomerProfileDto = z.infer<typeof UpdateCustomerProfileSchema>;
