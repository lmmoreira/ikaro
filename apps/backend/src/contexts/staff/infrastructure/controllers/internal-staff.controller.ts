import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { ActivateStaffDto, ActivateStaffSchema } from '../../application/dtos/activate-staff.dto';
import {
  ActivateStaffUseCaseResult,
  ActivateStaffUseCase,
} from '../../application/use-cases/activate-staff.use-case';
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
    private readonly activateStaff: ActivateStaffUseCase,
  ) {}

  @Get('by-oauth')
  async getByOAuth(
    @Query('googleOAuthId') googleOAuthId: string,
  ): Promise<GetStaffByOAuthIdUseCaseResult> {
    if (!googleOAuthId) {
      throw new BadRequestException({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'googleOAuthId query parameter is required',
      });
    }
    return this.getStaffByOAuthId.execute(googleOAuthId).catch(mapStaffError);
  }

  @Get('by-email')
  async getByEmail(
    @Query('email') email: string,
    @Query('tenantId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    tenantId: string,
  ): Promise<GetStaffByEmailUseCaseResult> {
    if (!email || !tenantId) {
      throw new BadRequestException({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'email and tenantId query parameters are required',
      });
    }
    return this.getStaffByEmail.execute(email, tenantId).catch(mapStaffError);
  }

  @Post(':staffId/activate')
  @HttpCode(HttpStatus.OK)
  activate(
    @Param('staffId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    staffId: string,
    @Body(new ZodValidationPipe(ActivateStaffSchema)) dto: ActivateStaffDto,
  ): Promise<ActivateStaffUseCaseResult> {
    return this.activateStaff.execute(staffId, dto).catch(mapStaffError);
  }
}
