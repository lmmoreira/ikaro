import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { z } from 'zod';
import { CustomerProfileResponse } from '@ikaro/types';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { Roles } from '../shared/decorators/roles.decorator';
import { BackendHttpService } from '../shared/http/backend-http.service';

const AddressSchema = z.object({
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().min(1).optional(),
  city: z.string().min(1),
  state: z.string().trim().min(1).max(10),
  zipCode: z.string().trim().min(1).max(20),
});

export const UpdateCustomerProfileBodySchema = z.object({
  name: z.string().min(1).optional(),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'phone must be in E.164 format')
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
