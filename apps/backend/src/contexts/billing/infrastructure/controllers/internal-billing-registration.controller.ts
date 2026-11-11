import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import {
  ReserveSignupRegistrationDto,
  ReserveSignupRegistrationSchema,
} from '../../application/dtos/reserve-signup-registration.dto';
import {
  ReserveSignupRegistrationUseCase,
  ReserveSignupRegistrationUseCaseInput,
  ReserveSignupRegistrationUseCaseResult,
} from '../../application/use-cases/reserve-signup-registration.use-case';
import { mapBillingError } from '../http/billing-error.mapper';

// Tenant-less by design: `/internal/*` skips the RequestInterceptor, and the registration exists
// before the tenant does. Called by the BFF (self-signup) and `scripts/provision-tenant.sh`.
@UseGuards(InternalApiGuard)
@Controller('internal/billing/registrations')
export class InternalBillingRegistrationController {
  constructor(private readonly reserveRegistration: ReserveSignupRegistrationUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  reserve(
    @Body(new ZodValidationPipe(ReserveSignupRegistrationSchema))
    dto: ReserveSignupRegistrationDto,
  ): Promise<ReserveSignupRegistrationUseCaseResult> {
    const input: ReserveSignupRegistrationUseCaseInput = {
      source: dto.source,
      googleSub: dto.googleSub,
      // The schema guarantees a country whenever a tax id is present.
      taxId:
        dto.taxId !== undefined && dto.countryCode !== undefined
          ? { raw: dto.taxId, countryCode: dto.countryCode }
          : undefined,
      termsVersion: dto.terms?.version,
    };
    return this.reserveRegistration.execute(input).catch(mapBillingError);
  }
}
