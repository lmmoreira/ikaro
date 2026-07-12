import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CanonicalParseUUIDPipe } from '@ikaro/nestjs-http';
import { GenericErrorCode } from '@ikaro/types';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import {
  LinkGoogleAccountDto,
  LinkGoogleAccountSchema,
} from '../../application/dtos/link-google-account.dto';
import {
  LinkGoogleAccountUseCase,
  LinkGoogleAccountUseCaseResult,
} from '../../application/use-cases/link-google-account.use-case';
import {
  GetStaffByEmailUseCase,
  GetStaffByEmailUseCaseResult,
} from '../../application/use-cases/get-staff-by-email.use-case';
import {
  GetStaffByOAuthIdUseCase,
  GetStaffByOAuthIdUseCaseResult,
} from '../../application/use-cases/get-staff-by-oauth-id.use-case';
import { mapStaffError } from '../http/staff-error.mapper';

// Auth-flow endpoints only — called by BFF during OAuth callback.
// Protected at network level (backend not exposed publicly — BFF-only access).
@Controller('internal/staff')
export class InternalStaffController {
  constructor(
    private readonly getStaffByOAuthId: GetStaffByOAuthIdUseCase,
    private readonly getStaffByEmail: GetStaffByEmailUseCase,
    private readonly linkGoogleAccount: LinkGoogleAccountUseCase,
  ) {}

  @Get('by-oauth')
  async getByOAuth(
    @Query('googleOAuthId') googleOAuthId: string,
  ): Promise<GetStaffByOAuthIdUseCaseResult[]> {
    if (!googleOAuthId) {
      throw new BadRequestException({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        code: GenericErrorCode.FIELD_REQUIRED,
        detail: 'googleOAuthId query parameter is required',
        field: 'googleOAuthId',
      });
    }
    return this.getStaffByOAuthId.execute({ googleOAuthId });
  }

  @Get('by-email')
  async getByEmail(
    @Query('email') email: string,
    @Query('tenantId', CanonicalParseUUIDPipe)
    tenantId: string,
  ): Promise<GetStaffByEmailUseCaseResult> {
    if (!email || !tenantId) {
      throw new BadRequestException({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        code: GenericErrorCode.FIELD_REQUIRED,
        detail: 'email and tenantId query parameters are required',
      });
    }
    return this.getStaffByEmail.execute({ email, tenantId }).catch(mapStaffError);
  }

  @Post(':staffId/link-google')
  @HttpCode(HttpStatus.OK)
  linkGoogle(
    @Param('staffId', CanonicalParseUUIDPipe)
    staffId: string,
    @Body(new ZodValidationPipe(LinkGoogleAccountSchema)) dto: LinkGoogleAccountDto,
  ): Promise<LinkGoogleAccountUseCaseResult> {
    return this.linkGoogleAccount.execute(staffId, dto).catch(mapStaffError);
  }
}
