import { z } from 'zod';
import { PhoneErrorCode } from '@ikaro/types';
import { AddressSchema, isValidPhoneNumber } from '@ikaro/validation';

// Request Zod schemas and their inferred body/query types — split out of
// customers.controller.ts so request-side shapes never live inline in the controller
// (mirrors booking/bookings.schemas.ts's existing split).
export const UpdateCustomerProfileBodySchema = z.object({
  name: z.string().min(1).optional(),
  phone: z
    .string()
    .refine((v) => isValidPhoneNumber(v), {
      error: 'phone must be in E.164 format',
      params: { code: PhoneErrorCode.FORMAT_INVALID },
    })
    .nullable()
    .optional(),
  defaultAddress: AddressSchema.nullable().optional(),
});

export type UpdateCustomerProfileBody = z.infer<typeof UpdateCustomerProfileBodySchema>;

export const CustomerSearchQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CustomerSearchQuery = z.infer<typeof CustomerSearchQuerySchema>;
