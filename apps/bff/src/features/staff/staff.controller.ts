import {
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
import { z } from 'zod';
import {
  DeactivateStaffResponse,
  InviteStaffResponse,
  StaffListResponse,
  StaffResponse,
} from '@ikaro/types';
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
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
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
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<StaffResponse> {
    return this.backendHttp.get<StaffResponse>(`/staff/${id}`);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<DeactivateStaffResponse> {
    return this.backendHttp.patch<DeactivateStaffResponse>(`/staff/${id}/deactivate`, {});
  }
}
