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
} from '@nestjs/common';
import {
  ActivateStaffResponse,
  DeactivateStaffResponse,
  InviteStaffResponse,
  StaffListResponse,
  StaffResponse,
  UpdateStaffResponse,
} from '@ikaro/types';
import {
  CanonicalParseIntPipe,
  CanonicalParseUUIDPipe,
  ZodValidationPipe,
} from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { toStaffListResponse } from './staff.mapper';
import { StaffItemListResponse } from './staff.types';
import {
  InviteStaffBody,
  InviteStaffBodySchema,
  UpdateStaffBody,
  UpdateStaffBodySchema,
} from './staff.schemas';

// Request Zod schemas moved to staff.schemas.ts (TD37-S10) — re-exported here so existing
// imports of these symbols from this file keep working unchanged.
export * from './staff.schemas';

@Controller('staff')
@Roles('MANAGER')
export class StaffController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  invite(
    @Body(new ZodValidationPipe(InviteStaffBodySchema)) body: InviteStaffBody,
  ): Promise<InviteStaffResponse> {
    return this.backendHttp.post<InviteStaffResponse>('/staff/invite', {
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      role: body.role,
    });
  }

  @Get()
  list(
    @Query('limit', new DefaultValuePipe(50), CanonicalParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), CanonicalParseIntPipe) offset: number,
  ): Promise<StaffListResponse> {
    return this.backendHttp
      .get<StaffItemListResponse>('/staff', { limit, offset })
      .then(toStaffListResponse);
  }

  // Declared before ':id' — NestJS resolves routes in declaration order, and a dynamic
  // segment declared first would swallow this literal path as id='me' (see ANTI_PATTERNS.md).
  //
  // Calls backend's own self-service GET /staff/me (StaffOrManagerRoleGuard), not
  // GET /staff/:id — that route is ManagerRoleGuard-gated and always 403s a plain STAFF actor
  // (same class of bug ActiveStaffGuard's comment documents for /staff/me/status, TD23 Story 11).
  @Get('me')
  @Roles('STAFF', 'MANAGER')
  getMe(): Promise<StaffResponse> {
    return this.backendHttp.get<StaffResponse>('/staff/me');
  }

  @Get(':id')
  getById(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<StaffResponse> {
    return this.backendHttp.get<StaffResponse>(`/staff/${id}`);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateStaffBodySchema)) body: UpdateStaffBody,
  ): Promise<UpdateStaffResponse> {
    return this.backendHttp.patch<UpdateStaffResponse>(`/staff/${id}`, body);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<DeactivateStaffResponse> {
    return this.backendHttp.patch<DeactivateStaffResponse>(`/staff/${id}/deactivate`, {});
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  activate(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<ActivateStaffResponse> {
    return this.backendHttp.patch<ActivateStaffResponse>(`/staff/${id}/activate`, {});
  }
}
