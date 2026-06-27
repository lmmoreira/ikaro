import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequestContext } from '../../../../shared/request/request-context';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { CustomerRoleGuard } from '../../../../shared/guards/customer-role.guard';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import { mapCustomerError } from '../http/customer-error.mapper';
import {
  UpdateCustomerProfileDto,
  UpdateCustomerProfileSchema,
} from '../../application/dtos/update-customer-profile.dto';
import {
  GetCustomerByIdUseCase,
  GetCustomerByIdUseCaseResult,
} from '../../application/use-cases/get-customer-by-id.use-case';
import {
  GetCustomerTenantsByIdUseCase,
  GetCustomerTenantsByIdUseCaseResult,
} from '../../application/use-cases/get-customer-tenants-by-id.use-case';
import {
  UpdateCustomerProfileUseCase,
  UpdateCustomerProfileUseCaseResult,
} from '../../application/use-cases/update-customer-profile.use-case';
import {
  SearchCustomersUseCase,
  SearchCustomersUseCaseResult,
} from '../../application/use-cases/search-customers.use-case';

export type GetCustomerProfileResponse = {
  customerId: string;
  email: string;
  name: string;
  phone: string | null;
  defaultAddress: GetCustomerByIdUseCaseResult['defaultAddress'];
};

@Controller('customers')
export class CustomerController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly getCustomerById: GetCustomerByIdUseCase,
    private readonly updateProfile: UpdateCustomerProfileUseCase,
    private readonly searchCustomers: SearchCustomersUseCase,
    private readonly getCustomerTenantsById: GetCustomerTenantsByIdUseCase,
  ) {}

  @Get()
  @UseGuards(StaffOrManagerRoleGuard)
  search(
    @Query('search') search?: string,
    @Query('limit', new DefaultValuePipe(20)) limit?: string,
  ): Promise<SearchCustomersUseCaseResult> {
    return this.searchCustomers.execute({
      search: search || undefined,
      limit: Math.max(1, Math.min(Math.trunc(Number(limit) || 20), 100)),
    });
  }

  @Get('me')
  @UseGuards(CustomerRoleGuard)
  getMe(): Promise<GetCustomerProfileResponse> {
    return this.getCustomerById
      .execute(this.ctx.actorId!, this.ctx.tenantId)
      .then((customer) => ({
        customerId: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        defaultAddress: customer.defaultAddress,
      }))
      .catch(mapCustomerError);
  }

  @Get('me/tenants')
  @UseGuards(CustomerRoleGuard)
  getMyTenants(): Promise<GetCustomerTenantsByIdUseCaseResult> {
    return this.getCustomerTenantsById
      .execute(this.ctx.actorId!, this.ctx.tenantId)
      .catch(mapCustomerError);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CustomerRoleGuard)
  updateMe(
    @Body(new ZodValidationPipe(UpdateCustomerProfileSchema)) dto: UpdateCustomerProfileDto,
  ): Promise<UpdateCustomerProfileUseCaseResult> {
    return this.updateProfile.execute(dto).catch(mapCustomerError);
  }
}
