import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NoFeatureGate, SuspensionAccess, ZodValidationPipe } from '@ikaro/nestjs-http';
import { z } from 'zod';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import {
  SignupEligibilityQueryDto,
  SignupEligibilityQuerySchema,
} from '../../application/dtos/signup-eligibility.dto';
import {
  ReserveSignupRegistrationDto,
  ReserveSignupRegistrationSchema,
} from '../../application/dtos/reserve-signup-registration.dto';
import {
  GetSignupEligibilityUseCaseResult,
  GetSignupEligibilityUseCase,
} from '../../application/use-cases/get-signup-eligibility.use-case';
import {
  ReleaseSignupRegistrationUseCaseResult,
  ReleaseSignupRegistrationUseCase,
} from '../../application/use-cases/release-signup-registration.use-case';
import {
  ReserveSignupRegistrationUseCase,
  ReserveSignupRegistrationUseCaseInput,
  ReserveSignupRegistrationUseCaseResult,
} from '../../application/use-cases/reserve-signup-registration.use-case';
import { mapBillingError } from '../http/billing-error.mapper';

// Tenant-less by design: `/internal/*` skips the RequestInterceptor, and the registration exists
// before the tenant does. Called by the BFF (self-signup) and `scripts/provision-tenant.sh`.
@UseGuards(InternalApiGuard)
@NoFeatureGate()
@SuspensionAccess('ANY_AUTHENTICATED')
@Controller('internal/billing/registrations')
export class InternalBillingRegistrationController {
  constructor(
    private readonly reserveRegistration: ReserveSignupRegistrationUseCase,
    private readonly getEligibility: GetSignupEligibilityUseCase,
    private readonly releaseRegistration: ReleaseSignupRegistrationUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  reserve(
    @Body(new ZodValidationPipe(ReserveSignupRegistrationSchema))
    dto: ReserveSignupRegistrationDto,
  ): Promise<ReserveSignupRegistrationUseCaseResult> {
    const input: ReserveSignupRegistrationUseCaseInput = {
      source: dto.source,
      googleSub: dto.googleSub,
      // The schema guarantees a country whenever a tax id is present or the source is SELF_SIGNUP.
      countryCode: dto.countryCode,
      taxId: dto.taxId,
      termsVersion: dto.terms?.version,
      exempt: dto.exempt,
    };
    return this.reserveRegistration.execute(input).catch(mapBillingError);
  }

  // Read-only (UC-127): no lock and no insert, so a session read can never reserve anything.
  @Get('eligibility')
  eligibility(
    @Query(new ZodValidationPipe(SignupEligibilityQuerySchema)) query: SignupEligibilityQueryDto,
  ): Promise<GetSignupEligibilityUseCaseResult> {
    return this.getEligibility.execute({ googleSub: query.googleSub }).catch(mapBillingError);
  }

  // Idempotent: an unknown, already released or `COMPLETED` registration answers
  // `{ released: false }` and nothing is deleted.
  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  release(
    @Param('id', new ZodValidationPipe(z.uuid())) id: string,
  ): Promise<ReleaseSignupRegistrationUseCaseResult> {
    return this.releaseRegistration.execute({ registrationId: id }).catch(mapBillingError);
  }
}
