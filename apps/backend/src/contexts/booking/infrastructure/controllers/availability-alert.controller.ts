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
  UseGuards,
} from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { CustomerRoleGuard } from '../../../../shared/guards/customer-role.guard';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  CreateAvailabilityAlertDto,
  CreateAvailabilityAlertSchema,
} from '../../application/dtos/create-availability-alert.dto';
import {
  UpdateAvailabilityAlertDto,
  UpdateAvailabilityAlertSchema,
} from '../../application/dtos/update-availability-alert.dto';
import {
  CancelAvailabilityAlertUseCase,
  CancelAvailabilityAlertUseCaseResult,
} from '../../application/use-cases/cancel-availability-alert.use-case';
import {
  CreateAvailabilityAlertUseCase,
  CreateAvailabilityAlertUseCaseResult,
} from '../../application/use-cases/create-availability-alert.use-case';
import {
  GetAvailabilityAlertUseCase,
  GetAvailabilityAlertUseCaseResult,
} from '../../application/use-cases/get-availability-alert.use-case';
import {
  ListAvailabilityAlertsUseCase,
  ListAvailabilityAlertsUseCaseResult,
} from '../../application/use-cases/list-availability-alerts.use-case';
import {
  UpdateAvailabilityAlertUseCase,
  UpdateAvailabilityAlertUseCaseResult,
} from '../../application/use-cases/update-availability-alert.use-case';
import { mapBookingError } from '../http/booking-error.mapper';

// UC-072 / UC-076 — authenticated customers only; every route acts on the caller's own alerts
// (the customerId always comes from the JWT-derived request context, never the body).
@Controller('availability-alerts')
@UseGuards(CustomerRoleGuard)
export class AvailabilityAlertController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly createAlert: CreateAvailabilityAlertUseCase,
    private readonly listAlerts: ListAvailabilityAlertsUseCase,
    private readonly getAlert: GetAvailabilityAlertUseCase,
    private readonly updateAlert: UpdateAvailabilityAlertUseCase,
    private readonly cancelAlert: CancelAvailabilityAlertUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(CreateAvailabilityAlertSchema)) body: CreateAvailabilityAlertDto,
  ): Promise<CreateAvailabilityAlertUseCaseResult> {
    const { tenantId, correlationId, actorId, settings } = this.ctx;
    return this.createAlert
      .execute({
        ...body,
        tenantId,
        correlationId,
        customerId: actorId!,
        timezone: settings.businessHours.timezone,
      })
      .catch(mapBookingError);
  }

  @Get()
  list(): Promise<ListAvailabilityAlertsUseCaseResult> {
    const { tenantId, actorId } = this.ctx;
    return this.listAlerts.execute({ tenantId, customerId: actorId! }).catch(mapBookingError);
  }

  @Get(':id')
  get(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<GetAvailabilityAlertUseCaseResult> {
    const { tenantId, actorId } = this.ctx;
    return this.getAlert
      .execute({ alertId: id, tenantId, customerId: actorId! })
      .catch(mapBookingError);
  }

  @Patch(':id')
  update(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateAvailabilityAlertSchema)) body: UpdateAvailabilityAlertDto,
  ): Promise<UpdateAvailabilityAlertUseCaseResult> {
    const { tenantId, correlationId, actorId } = this.ctx;
    return this.updateAlert
      .execute({ ...body, alertId: id, tenantId, correlationId, customerId: actorId! })
      .catch(mapBookingError);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<CancelAvailabilityAlertUseCaseResult> {
    const { tenantId, correlationId, actorId } = this.ctx;
    return this.cancelAlert
      .execute({ alertId: id, tenantId, correlationId, customerId: actorId! })
      .catch(mapBookingError);
  }
}
