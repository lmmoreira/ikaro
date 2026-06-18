import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { HotsiteServiceResponse } from '@ikaro/types';
import { Roles } from '../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { BackendHttpService } from '../shared/http/backend-http.service';

const CreateServiceBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceAmount: z.number().positive(),
  durationMinutes: z.number().int().positive(),
  loyaltyPointsValue: z.number().int().min(0),
  requiresPickupAddress: z.boolean().optional(),
});

const UpdateServiceBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priceAmount: z.number().positive().optional(),
  durationMinutes: z.number().int().positive().optional(),
  loyaltyPointsValue: z.number().int().min(0).optional(),
  requiresPickupAddress: z.boolean().optional(),
});

type CreateServiceBody = z.infer<typeof CreateServiceBodySchema>;
type UpdateServiceBody = z.infer<typeof UpdateServiceBodySchema>;

@Controller('services')
export class ServicesController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('MANAGER', 'STAFF')
  create(
    @Body(new ZodValidationPipe(CreateServiceBodySchema)) body: CreateServiceBody,
  ): Promise<HotsiteServiceResponse> {
    return this.backendHttp.post<HotsiteServiceResponse>('/services', body);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER', 'STAFF')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateServiceBodySchema)) body: UpdateServiceBody,
  ): Promise<HotsiteServiceResponse> {
    return this.backendHttp.patch<HotsiteServiceResponse>(`/services/${id}`, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER', 'STAFF')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<{ id: string; isActive: false }> {
    return this.backendHttp.delete<{ id: string; isActive: false }>(`/services/${id}`);
  }
}
