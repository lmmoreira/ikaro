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
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { InviteStaffBodyDto, InviteStaffSchema } from '../../application/dtos/invite-staff.dto';
import {
  DeactivateStaffUseCase,
  DeactivateStaffUseCaseResult,
} from '../../application/use-cases/deactivate-staff.use-case';
import {
  GetStaffByIdUseCase,
  GetStaffByIdUseCaseResult,
} from '../../application/use-cases/get-staff-by-id.use-case';
import {
  InviteStaffUseCase,
  InviteStaffUseCaseResult,
} from '../../application/use-cases/invite-staff.use-case';
import {
  ListStaffUseCase,
  ListStaffUseCaseResult,
} from '../../application/use-cases/list-staff.use-case';
import { mapStaffError } from '../http/staff-error.mapper';

// Management endpoints — tenantId and actorId come from TenantContext (set by TenantInterceptor).
@Controller('staff')
export class StaffController {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly listStaff: ListStaffUseCase,
    private readonly getStaffById: GetStaffByIdUseCase,
    private readonly inviteStaff: InviteStaffUseCase,
    private readonly deactivateStaff: DeactivateStaffUseCase,
  ) {}

  @Get()
  list(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ): Promise<ListStaffUseCaseResult> {
    return this.listStaff.execute(this.tenantContext.tenantId, limit, offset).catch(mapStaffError);
  }

  @Get(':id')
  getById(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
  ): Promise<GetStaffByIdUseCaseResult> {
    return this.getStaffById.execute(id, this.tenantContext.tenantId).catch(mapStaffError);
  }

  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  invite(
    @Body(new ZodValidationPipe(InviteStaffSchema)) body: InviteStaffBodyDto,
  ): Promise<InviteStaffUseCaseResult> {
    const actorId = this.tenantContext.actorId;
    if (!actorId) throw new BadRequestException('X-Actor-ID header is required');
    return this.inviteStaff
      .execute({
        tenantId: this.tenantContext.tenantId,
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        role: body.role,
        invitedBy: actorId,
      })
      .catch(mapStaffError);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
  ): Promise<DeactivateStaffUseCaseResult> {
    const actorId = this.tenantContext.actorId;
    if (!actorId) throw new BadRequestException('X-Actor-ID header is required');
    return this.deactivateStaff
      .execute(id, this.tenantContext.tenantId, actorId)
      .catch(mapStaffError);
  }
}
