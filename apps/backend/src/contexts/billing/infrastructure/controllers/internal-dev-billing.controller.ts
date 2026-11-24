import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { NoFeatureGate, SuspensionAccess, ZodValidationPipe } from '@ikaro/nestjs-http';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { PlatformAdminGuard } from '../../../../shared/guards/platform-admin.guard';
import {
  SimulateProviderEventDto,
  SimulateProviderEventSchema,
} from '../../application/dtos/simulate-provider-event.dto';
import {
  SimulateProviderEventUseCase,
  SimulateProviderEventUseCaseResult,
} from '../../application/use-cases/simulate-provider-event.use-case';
import { mapBillingError } from '../http/billing-error.mapper';

// Both operator-key guards (M25-S15a): the route fires provider events at a tenant's charge, so it
// needs `X-Internal-Key` and `X-Platform-Admin-Key`. Registered only in `local` and `staging`
// (`DevBillingModule.register`); the use case refuses a subscription whose profile is not `*_FAKE`.
@UseGuards(InternalApiGuard, PlatformAdminGuard)
@NoFeatureGate()
@SuspensionAccess('ANY_AUTHENTICATED')
@Controller('internal/dev/billing/provider')
export class InternalDevBillingController {
  constructor(
    @Inject(SimulateProviderEventUseCase)
    private readonly simulate: Pick<SimulateProviderEventUseCase, 'execute'>,
  ) {}

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  async simulateEvent(
    @Body(new ZodValidationPipe(SimulateProviderEventSchema)) dto: SimulateProviderEventDto,
    @Headers('x-correlation-id') correlationId: string,
  ): Promise<SimulateProviderEventUseCaseResult> {
    return this.simulate
      .execute({
        tenantId: dto.tenantId,
        chargeId: dto.chargeId,
        event: dto.event,
        delivery: dto.delivery,
        failure: dto.failure,
        correlationId,
      })
      .catch(mapBillingError);
  }
}
