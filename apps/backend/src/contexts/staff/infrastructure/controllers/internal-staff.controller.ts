import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { ActivateStaffDto, ActivateStaffSchema } from '../../application/dtos/activate-staff.dto';
import { InviteStaffDto, InviteStaffSchema } from '../../application/dtos/invite-staff.dto';
import {
  ActivateStaffUseCaseResult,
  ActivateStaffUseCase,
} from '../../application/use-cases/activate-staff.use-case';
import {
  GetStaffByEmailUseCase,
  GetStaffByEmailUseCaseResult,
} from '../../application/use-cases/get-staff-by-email.use-case';
import {
  GetStaffByIdUseCase,
  GetStaffByIdUseCaseResult,
} from '../../application/use-cases/get-staff-by-id.use-case';
import {
  GetStaffByOAuthIdUseCase,
  GetStaffByOAuthIdUseCaseResult,
} from '../../application/use-cases/get-staff-by-oauth-id.use-case';
import {
  InviteStaffUseCase,
  InviteStaffUseCaseResult,
} from '../../application/use-cases/invite-staff.use-case';
import {
  ListStaffUseCase,
  ListStaffUseCaseResult,
} from '../../application/use-cases/list-staff.use-case';
import { mapStaffError } from '../http/staff-error.mapper';

// MVP: protected at network level (backend not exposed publicly — BFF-only access).
// Future: add InternalApiGuard checking X-Internal-Key header.
@Controller('internal/staff')
export class InternalStaffController {
  constructor(
    private readonly getStaffByOAuthId: GetStaffByOAuthIdUseCase,
    private readonly getStaffByEmail: GetStaffByEmailUseCase,
    private readonly activateStaff: ActivateStaffUseCase,
    private readonly listStaff: ListStaffUseCase,
    private readonly getStaffById: GetStaffByIdUseCase,
    private readonly inviteStaff: InviteStaffUseCase,
  ) {}

  // Static routes must be declared before parameterised routes
  @Get()
  list(
    @Query('tenantId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    tenantId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ): Promise<ListStaffUseCaseResult> {
    return this.listStaff.execute(tenantId, limit, offset).catch(mapStaffError);
  }

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

  @Get(':id')
  getById(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
    @Query('tenantId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }))
    tenantId: string,
  ): Promise<GetStaffByIdUseCaseResult> {
    return this.getStaffById.execute(id, tenantId).catch(mapStaffError);
  }

  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  invite(
    @Body(new ZodValidationPipe(InviteStaffSchema)) dto: InviteStaffDto,
  ): Promise<InviteStaffUseCaseResult> {
    return this.inviteStaff.execute(dto).catch(mapStaffError);
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
