import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import {
  FindOrCreateCustomerDto,
  FindOrCreateCustomerSchema,
} from '../../application/dtos/find-or-create-customer.dto';
import { CustomerTenantSummary } from '../../application/ports/customer-repository.port';
import {
  FindOrCreateCustomerResult,
  FindOrCreateCustomerUseCase,
} from '../../application/use-cases/find-or-create-customer.use-case';
import { GetCustomerTenantsUseCase } from '../../application/use-cases/get-customer-tenants.use-case';
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
  getTenants(@Query('googleOAuthId') googleOAuthId: string): Promise<CustomerTenantSummary[]> {
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
  @UsePipes(new ZodValidationPipe(FindOrCreateCustomerSchema))
  findOrCreate(@Body() dto: FindOrCreateCustomerDto): Promise<FindOrCreateCustomerResult> {
    return this.findOrCreateCustomer.execute(dto);
  }
}
