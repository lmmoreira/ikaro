import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { NoFeatureGate, SuspensionAccess, ZodValidationPipe } from '@ikaro/nestjs-http';
import {
  SignupTenantDto,
  SignupTenantSchema,
  ValidateSignupDto,
  ValidateSignupSchema,
} from '../../application/dtos/signup.dto';
import {
  SignupTenantUseCase,
  SignupTenantUseCaseResult,
} from '../../application/use-cases/signup-tenant.use-case';
import { ValidateSignupUseCase } from '../../application/use-cases/validate-signup.use-case';
import { mapPlatformError } from '../http/platform-error.mapper';

// The two Platform calls of a self-signup (UC-127), both behind the global `InternalApiGuard`
// (X-Internal-Key): the BFF is the only caller, and no admin key is involved. Tenant-less by
// design, like `internal-slug.controller.ts` that shares the prefix.
@NoFeatureGate()
@SuspensionAccess('ANY_AUTHENTICATED')
@Controller('internal/signup')
export class InternalSignupController {
  constructor(
    private readonly validateSignup: ValidateSignupUseCase,
    private readonly signupTenant: SignupTenantUseCase,
  ) {}

  // Stateless: slug policy and availability, then Turnstile. Persists nothing.
  @Post('validate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async validate(
    @Body(new ZodValidationPipe(ValidateSignupSchema)) dto: ValidateSignupDto,
  ): Promise<void> {
    await this.validateSignup.execute(dto).catch(mapPlatformError);
  }

  @Post('tenant')
  @HttpCode(HttpStatus.CREATED)
  tenant(
    @Body(new ZodValidationPipe(SignupTenantSchema)) dto: SignupTenantDto,
  ): Promise<SignupTenantUseCaseResult> {
    return this.signupTenant.execute(dto).catch(mapPlatformError);
  }
}
