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
import { z } from 'zod';
import {
  ActivateStaffResponse,
  DeactivateStaffResponse,
  InviteStaffResponse,
  StaffListResponse,
  StaffResponse,
  UpdateStaffResponse,
} from '@ikaro/types';
import { CanonicalParseIntPipe, CanonicalParseUUIDPipe } from '@ikaro/nestjs-http';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { CurrentUser, CurrentUserPayload } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { toStaffListResponse } from './staff.mapper';
import { StaffItemListResponse } from './staff.types';

const InviteStaffBodySchema = z.object({
  email: z.email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['MANAGER', 'STAFF']),
});

type InviteStaffBody = z.infer<typeof InviteStaffBodySchema>;

const UpdateStaffBodySchema = z.object({
  name: z.string().min(1),
  role: z.enum(['MANAGER', 'STAFF']),
});

type UpdateStaffBody = z.infer<typeof UpdateStaffBodySchema>;

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
  @Get('me')
  @Roles('STAFF', 'MANAGER')
  getMe(@CurrentUser() user: CurrentUserPayload): Promise<StaffResponse> {
    return this.backendHttp.get<StaffResponse>(`/staff/${user.sub}`);
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
