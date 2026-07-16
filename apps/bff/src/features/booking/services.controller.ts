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
import { z } from 'zod';
import { StaffServiceListResponse, StaffServiceResponse } from '@ikaro/types';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { ServiceDetail, ServiceListResponse } from './services.types';
import { toStaffServiceListResponse, toStaffServiceResponse } from './services.mapper';

const CreateServiceBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceAmount: z.number().positive(),
  durationMinutes: z.number().int().positive(),
  loyaltyPointsValue: z.number().int().min(0),
  requiresPickupAddress: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const UpdateServiceBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    priceAmount: z.number().positive().optional(),
    durationMinutes: z.number().int().positive().optional(),
    loyaltyPointsValue: z.number().int().min(0).optional(),
    requiresPickupAddress: z.boolean().optional(),
  })
  .default({});

type CreateServiceBody = z.infer<typeof CreateServiceBodySchema>;
type UpdateServiceBody = z.infer<typeof UpdateServiceBodySchema>;

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
