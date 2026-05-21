import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { BackendHttpService } from '../shared/http/backend-http.service';
import { ServiceResponse } from './services.types';

const CreateServiceBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceAmount: z.number().positive(),
  durationMinutes: z.number().int().positive(),
  loyaltyPointsValue: z.number().int().min(0),
  requiresPickupAddress: z.boolean().optional(),
});

type CreateServiceBody = z.infer<typeof CreateServiceBodySchema>;

@Controller('services')
@Roles('MANAGER', 'STAFF')
export class ServicesController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(CreateServiceBodySchema)) body: CreateServiceBody,
  ): Promise<ServiceResponse> {
    return this.backendHttp.post<ServiceResponse>('/services', body);
  }
}
