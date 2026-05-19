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
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { CurrentUser, CurrentUserPayload } from '../shared/decorators/current-user.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { BackendHttpService } from '../shared/http/backend-http.service';

const InviteStaffBodySchema = z.object({
  email: z.email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['MANAGER', 'STAFF']),
});

type InviteStaffBody = z.infer<typeof InviteStaffBodySchema>;

interface InviteStaffResponse {
  staffId: string;
  email: string;
  role: 'MANAGER' | 'STAFF';
  isActive: false;
}

interface DeactivateStaffResponse {
  staffId: string;
  isActive: false;
}

interface StaffItem {
  id: string;
  email: string;
  name: string | null;
  role: 'MANAGER' | 'STAFF';
  isActive: boolean;
  createdAt: string;
}

interface StaffListResponse {
  items: StaffItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
}

@Controller('v1/staff')
@Roles('MANAGER')
export class StaffController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  invite(
    @Body(new ZodValidationPipe(InviteStaffBodySchema)) body: InviteStaffBody,
    @CurrentUser() _user: CurrentUserPayload,
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
    @CurrentUser() _user: CurrentUserPayload,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ): Promise<StaffListResponse> {
    return this.backendHttp.get<StaffListResponse>('/staff', { limit, offset });
  }

  @Get(':id')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() _user: CurrentUserPayload,
  ): Promise<StaffItem> {
    return this.backendHttp.get<StaffItem>(`/staff/${id}`);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() _user: CurrentUserPayload,
  ): Promise<DeactivateStaffResponse> {
    return this.backendHttp.patch<DeactivateStaffResponse>(`/staff/${id}/deactivate`, {});
  }
}
