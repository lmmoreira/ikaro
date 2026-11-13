import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { PlatformAdminGuard } from '../../../../shared/guards/platform-admin.guard';
import {
  ExtendGraceDto,
  ExtendGraceSchema,
  ListTenantBillingStatusDto,
  ListTenantBillingStatusSchema,
  OperatorActionDto,
  OperatorActionSchema,
  SetExemptDto,
  SetExemptSchema,
} from '../../application/dtos/operator-billing.dto';
import {
  ExtendGraceUseCase,
  ExtendGraceUseCaseResult,
} from '../../application/use-cases/extend-grace.use-case';
import {
  ListTenantBillingStatusUseCase,
  ListTenantBillingStatusUseCaseResult,
} from '../../application/use-cases/list-tenant-billing-status.use-case';
import {
  SetTenantExemptUseCase,
  SetTenantExemptUseCaseResult,
} from '../../application/use-cases/set-tenant-exempt.use-case';
import {
  SuspendTenantByOperatorUseCase,
  SuspendTenantByOperatorUseCaseResult,
} from '../../application/use-cases/suspend-tenant-by-operator.use-case';
import {
  UnsuspendTenantUseCase,
  UnsuspendTenantUseCaseResult,
} from '../../application/use-cases/unsuspend-tenant.use-case';
import { mapBillingError } from '../http/billing-error.mapper';

// The operator edge cases of UC-111 / UC-137, on both keys: `X-Internal-Key` and
// `X-Platform-Admin-Key`. The backend is on internal ingress, so these are reachable only from the
// relay VM (`scripts/billing-operator.sh`). Tenant-less like every `/internal/*` route: the tenant
// is the explicit path parameter. Every write is audited in the use case's own transaction. The
// correlation id is the one the correlation middleware set on the request (it runs on every route,
// guard-rejected ones included), so the events link back to the operator call.
@UseGuards(InternalApiGuard, PlatformAdminGuard)
@Controller('internal')
export class InternalBillingOperatorController {
  constructor(
    private readonly suspendTenant: SuspendTenantByOperatorUseCase,
    private readonly unsuspendTenant: UnsuspendTenantUseCase,
    private readonly extendGrace: ExtendGraceUseCase,
    private readonly setTenantExempt: SetTenantExemptUseCase,
    private readonly listTenantBillingStatus: ListTenantBillingStatusUseCase,
  ) {}

  @Post('tenants/:tenantId/billing/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(
    @Param('tenantId', CanonicalParseUUIDPipe) tenantId: string,
    @Body(new ZodValidationPipe(OperatorActionSchema)) dto: OperatorActionDto,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<SuspendTenantByOperatorUseCaseResult> {
    return this.suspendTenant.execute({ tenantId, correlationId, ...dto }).catch(mapBillingError);
  }

  @Post('tenants/:tenantId/billing/unsuspend')
  @HttpCode(HttpStatus.OK)
  unsuspend(
    @Param('tenantId', CanonicalParseUUIDPipe) tenantId: string,
    @Body(new ZodValidationPipe(OperatorActionSchema)) dto: OperatorActionDto,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<UnsuspendTenantUseCaseResult> {
    return this.unsuspendTenant.execute({ tenantId, correlationId, ...dto }).catch(mapBillingError);
  }

  @Post('tenants/:tenantId/billing/grace')
  @HttpCode(HttpStatus.OK)
  grace(
    @Param('tenantId', CanonicalParseUUIDPipe) tenantId: string,
    @Body(new ZodValidationPipe(ExtendGraceSchema)) dto: ExtendGraceDto,
  ): Promise<ExtendGraceUseCaseResult> {
    return this.extendGrace.execute({ tenantId, ...dto }).catch(mapBillingError);
  }

  @Put('tenants/:tenantId/billing/exempt')
  @HttpCode(HttpStatus.OK)
  exempt(
    @Param('tenantId', CanonicalParseUUIDPipe) tenantId: string,
    @Body(new ZodValidationPipe(SetExemptSchema)) dto: SetExemptDto,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<SetTenantExemptUseCaseResult> {
    return this.setTenantExempt.execute({ tenantId, correlationId, ...dto }).catch(mapBillingError);
  }

  @Get('billing/tenants')
  list(
    @Query(new ZodValidationPipe(ListTenantBillingStatusSchema)) query: ListTenantBillingStatusDto,
  ): Promise<ListTenantBillingStatusUseCaseResult> {
    return this.listTenantBillingStatus.execute(query).catch(mapBillingError);
  }
}
