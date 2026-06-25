import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  FindOrCreateCustomerDto,
  FindOrCreateCustomerSchema,
} from '../../application/dtos/find-or-create-customer.dto';
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
    @Query('googleOAuthId') googleOAuthId: string,
  ): Promise<GetCustomerTenantsUseCaseResult> {
    if (!googleOAuthId) {
      throw new BadRequestException({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'googleOAuthId query parameter is required',
      });
    }
    return this.getCustomerTenants.execute(googleOAuthId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  findOrCreate(
    @Body(new ZodValidationPipe(FindOrCreateCustomerSchema)) dto: FindOrCreateCustomerDto,
  ): Promise<FindOrCreateCustomerUseCaseResult> {
    return this.findOrCreateCustomer.execute(dto);
  }
}
