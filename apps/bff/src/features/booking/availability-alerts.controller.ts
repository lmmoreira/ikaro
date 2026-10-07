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
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import {
  AvailabilityAlertListResponse,
  AvailabilityAlertResponse,
  CancelAvailabilityAlertResponse,
} from '@ikaro/types';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import {
  CreateAvailabilityAlertBody,
  CreateAvailabilityAlertBodySchema,
  UpdateAvailabilityAlertBody,
  UpdateAvailabilityAlertBodySchema,
} from './availability-alerts.schemas';

// Thin proxy (UC-072, UC-076) — authenticated customers only; the backend derives the customer
// from the forwarded actor headers and every ownership decision (own alerts only) is made there,
// matching docs/24-BFF_ARCHITECTURE.md's "BFF orchestrates, backend decides" split.
@Controller('availability-alerts')
@Roles('CUSTOMER')
export class AvailabilityAlertsController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(CreateAvailabilityAlertBodySchema))
    body: CreateAvailabilityAlertBody,
  ): Promise<AvailabilityAlertResponse> {
    return this.backendHttp.post<AvailabilityAlertResponse>('/availability-alerts', body);
  }

  @Get()
  list(): Promise<AvailabilityAlertListResponse> {
    return this.backendHttp.get<AvailabilityAlertListResponse>('/availability-alerts');
  }

  @Patch(':id')
  update(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateAvailabilityAlertBodySchema))
    body: UpdateAvailabilityAlertBody,
  ): Promise<AvailabilityAlertResponse> {
    return this.backendHttp.patch<AvailabilityAlertResponse>(`/availability-alerts/${id}`, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<CancelAvailabilityAlertResponse> {
    return this.backendHttp.delete<CancelAvailabilityAlertResponse>(`/availability-alerts/${id}`);
  }
}
