import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  FindOrCreateCustomerDto,
  FindOrCreateCustomerSchema,
} from '../../application/dtos/find-or-create-customer.dto';
import {
  GetCustomerTenantsDto,
  GetCustomerTenantsSchema,
} from '../../application/dtos/get-customer-tenants.dto';
import {
  FindOrCreateCustomerUseCaseResult,
  FindOrCreateCustomerUseCase,
} from '../../application/use-cases/find-or-create-customer.use-case';
import {
  GetCustomerTenantsUseCase,
  GetCustomerTenantsUseCaseResult,
} from '../../application/use-cases/get-customer-tenants.use-case';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';

// MVP: protected at network level (backend not exposed publicly — BFF-only access).
// Future: add InternalApiGuard checking X-Internal-Key header.
@Controller('internal/customers')
export class InternalCustomerController {
  constructor(
    private readonly getCustomerTenants: GetCustomerTenantsUseCase,
    private readonly findOrCreateCustomer: FindOrCreateCustomerUseCase,
  ) {}

  @Get('tenants')
  getTenants(
    @Query(new ZodValidationPipe(GetCustomerTenantsSchema)) query: GetCustomerTenantsDto,
  ): Promise<GetCustomerTenantsUseCaseResult> {
    return this.getCustomerTenants.execute(query.googleOAuthId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  findOrCreate(
    @Body(new ZodValidationPipe(FindOrCreateCustomerSchema)) dto: FindOrCreateCustomerDto,
  ): Promise<FindOrCreateCustomerUseCaseResult> {
    return this.findOrCreateCustomer.execute(dto);
  }
}
