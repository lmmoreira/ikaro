import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { Roles } from '../shared/decorators/roles.decorator';
import { BackendHttpService } from '../shared/http/backend-http.service';
import { CustomerProfileResponse } from './customers.types';

const AddressSchema = z.object({
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zipCode: z.string().regex(/^\d{5}-?\d{3}$/, 'zipCode must be 8 digits (hyphen optional)'),
});

export const UpdateCustomerProfileBodySchema = z.object({
  name: z.string().min(1).optional(),
  phone: z
    .string()
    .refine((v) => {
      const d = v.replace(/\D/g, '');
      return d.length === 10 || d.length === 11;
    }, 'phone must have 10 or 11 digits')
    .nullable()
    .optional(),
  defaultAddress: AddressSchema.nullable().optional(),
});

export type UpdateCustomerProfileBody = z.infer<typeof UpdateCustomerProfileBodySchema>;

@Controller('customers')
@Roles('CUSTOMER')
export class CustomersController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get('me')
  getProfile(): Promise<CustomerProfileResponse> {
    return this.backendHttp.get<CustomerProfileResponse>('/customers/me');
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  updateProfile(
    @Body(new ZodValidationPipe(UpdateCustomerProfileBodySchema)) body: UpdateCustomerProfileBody,
  ): Promise<CustomerProfileResponse> {
    return this.backendHttp.patch<CustomerProfileResponse>('/customers/me', body);
  }
}
