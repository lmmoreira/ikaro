import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { StaffServiceListResponse, StaffServiceResponse } from '@ikaro/types';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { ServiceDetail, ServiceListResponse } from './services.types';
import { toStaffServiceListResponse, toStaffServiceResponse } from './services.mapper';
import {
  CreateServiceBody,
  CreateServiceBodySchema,
  UpdateServiceBody,
  UpdateServiceBodySchema,
} from './services.schemas';

// Request Zod schemas moved to services.schemas.ts (TD37-S10) — re-exported here so existing
// imports of these symbols from this file keep working unchanged.
export * from './services.schemas';

@Controller('services')
export class ServicesController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  @Roles('MANAGER', 'STAFF')
  async list(): Promise<StaffServiceListResponse> {
    const result = await this.backendHttp.get<ServiceListResponse>('/services');
    return toStaffServiceListResponse(result);
  }

  @Get(':id')
  @Roles('MANAGER', 'STAFF')
  async getOne(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<StaffServiceResponse> {
    const result = await this.backendHttp.get<ServiceDetail>(`/services/${id}`);
    return toStaffServiceResponse(result);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('MANAGER', 'STAFF')
  async create(
    @Body(new ZodValidationPipe(CreateServiceBodySchema)) body: CreateServiceBody,
  ): Promise<StaffServiceResponse> {
    const result = await this.backendHttp.post<ServiceDetail>('/services', body);
    return toStaffServiceResponse(result);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER', 'STAFF')
  async update(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateServiceBodySchema)) body: UpdateServiceBody,
  ): Promise<StaffServiceResponse> {
    const result = await this.backendHttp.patch<ServiceDetail>(`/services/${id}`, body);
    return toStaffServiceResponse(result);
  }

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER', 'STAFF')
  async activate(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<void> {
    await this.backendHttp.patch(`/services/${id}/activate`, {});
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('MANAGER', 'STAFF')
  async deactivate(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<void> {
    await this.backendHttp.delete(`/services/${id}`);
  }
}
