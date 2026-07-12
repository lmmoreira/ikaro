import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  CanonicalParseIntPipe,
  CanonicalParseUUIDPipe,
  throwProblemDetail,
} from '@ikaro/nestjs-http';
import { GenericErrorCode } from '@ikaro/types';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { InviteStaffBodyDto, InviteStaffSchema } from '../../application/dtos/invite-staff.dto';
import { UpdateStaffBodyDto, UpdateStaffSchema } from '../../application/dtos/update-staff.dto';
import {
  ActivateStaffUseCase,
  ActivateStaffUseCaseInput,
  ActivateStaffUseCaseResult,
} from '../../application/use-cases/activate-staff.use-case';
import {
  DeactivateStaffUseCase,
  DeactivateStaffUseCaseInput,
  DeactivateStaffUseCaseResult,
} from '../../application/use-cases/deactivate-staff.use-case';
import {
  UpdateStaffProfileUseCase,
  UpdateStaffProfileUseCaseInput,
  UpdateStaffProfileUseCaseResult,
} from '../../application/use-cases/update-staff-profile.use-case';
import {
  GetStaffByIdUseCase,
  GetStaffByIdUseCaseResult,
} from '../../application/use-cases/get-staff-by-id.use-case';
import {
  InviteStaffUseCase,
  InviteStaffUseCaseInput,
  InviteStaffUseCaseResult,
} from '../../application/use-cases/invite-staff.use-case';
import {
  GetStaffUseCase,
  GetStaffUseCaseResult,
} from '../../application/use-cases/get-staff.use-case';
import {
  GetStaffTenantsByIdUseCase,
  GetStaffTenantsByIdUseCaseResult,
} from '../../application/use-cases/get-staff-tenants-by-id.use-case';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import { mapStaffError } from '../http/staff-error.mapper';

@Controller('staff')
export class StaffController {
  constructor(
    private readonly tenantContext: RequestContext,
    private readonly getStaff: GetStaffUseCase,
    private readonly getStaffById: GetStaffByIdUseCase,
    private readonly inviteStaff: InviteStaffUseCase,
    private readonly deactivateStaff: DeactivateStaffUseCase,
    private readonly activateStaff: ActivateStaffUseCase,
    private readonly updateStaffProfile: UpdateStaffProfileUseCase,
    private readonly getStaffTenantsById: GetStaffTenantsByIdUseCase,
  ) {}

  @Get()
  @UseGuards(ManagerRoleGuard)
  list(
    @Query('limit', new DefaultValuePipe(50), CanonicalParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), CanonicalParseIntPipe) offset: number,
  ): Promise<GetStaffUseCaseResult> {
    return this.getStaff
      .execute({
        tenantId: this.tenantContext.tenantId,
        limit: Math.min(limit, 100),
        offset,
      })
      .catch(mapStaffError);
  }

  @Get('me/tenants')
  @UseGuards(StaffOrManagerRoleGuard)
  getMyTenants(): Promise<GetStaffTenantsByIdUseCaseResult[]> {
    return this.getStaffTenantsById
      .execute({ staffId: this.tenantContext.actorId!, tenantId: this.tenantContext.tenantId })
      .catch(mapStaffError);
  }

  // Self-status-check for BFF's ActiveStaffGuard — derives the target from RequestContext.actorId
  // only, never a URL param, so it can't be used to probe another staff member's status.
  // GET /staff/:id (below) is manager-only by design (staff-list lookups); reusing it here for a
  // STAFF actor's own self-check would always 403 (TD23 Story 11).
  @Get('me/status')
  @UseGuards(StaffOrManagerRoleGuard)
  async getMyStatus(): Promise<{ isActive: boolean }> {
    const { isActive } = await this.getStaffById
      .execute({ staffId: this.requireActorId(), tenantId: this.tenantContext.tenantId })
      .catch(mapStaffError);
    return { isActive };
  }

  @Get(':id')
  @UseGuards(ManagerRoleGuard)
  getById(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<GetStaffByIdUseCaseResult> {
    return this.getStaffById
      .execute({ staffId: id, tenantId: this.tenantContext.tenantId })
      .catch(mapStaffError);
  }

  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ManagerRoleGuard)
  invite(
    @Body(new ZodValidationPipe(InviteStaffSchema)) body: InviteStaffBodyDto,
  ): Promise<InviteStaffUseCaseResult> {
    const input: InviteStaffUseCaseInput = {
      tenantId: this.tenantContext.tenantId,
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      role: body.role,
      invitedBy: this.tenantContext.actorId ?? null,
      correlationId: this.tenantContext.correlationId,
    };
    return this.inviteStaff.execute(input).catch(mapStaffError);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ManagerRoleGuard)
  update(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateStaffSchema)) body: UpdateStaffBodyDto,
  ): Promise<UpdateStaffProfileUseCaseResult> {
    const input: UpdateStaffProfileUseCaseInput = {
      staffId: id,
      tenantId: this.tenantContext.tenantId,
      name: body.name,
      role: body.role,
    };
    return this.updateStaffProfile.execute(input).catch(mapStaffError);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ManagerRoleGuard)
  async deactivate(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<DeactivateStaffUseCaseResult> {
    const input: DeactivateStaffUseCaseInput = {
      staffId: id,
      tenantId: this.tenantContext.tenantId,
      deactivatedBy: this.requireActorId(),
      correlationId: this.tenantContext.correlationId,
    };
    return this.deactivateStaff.execute(input).catch(mapStaffError);
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ManagerRoleGuard)
  async activate(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<ActivateStaffUseCaseResult> {
    const input: ActivateStaffUseCaseInput = {
      staffId: id,
      tenantId: this.tenantContext.tenantId,
      activatedBy: this.requireActorId(),
      correlationId: this.tenantContext.correlationId,
    };
    return this.activateStaff.execute(input).catch(mapStaffError);
  }

  private requireActorId(): string {
    const actorId = this.tenantContext.actorId;
    if (!actorId) {
      throw throwProblemDetail(
        HttpStatus.BAD_REQUEST,
        GenericErrorCode.FIELD_REQUIRED,
        'X-Actor-ID header is required',
        'X-Actor-ID',
      );
    }
    return actorId;
  }
}
