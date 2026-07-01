import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { RequestContext } from '../../../../shared/request/request-context';
import { CreateServiceDto, CreateServiceSchema } from '../../application/dtos/create-service.dto';
import { UpdateServiceDto, UpdateServiceSchema } from '../../application/dtos/update-service.dto';
import {
  CreateServiceUseCase,
  CreateServiceUseCaseResult,
} from '../../application/use-cases/create-service.use-case';
import {
  DeactivateServiceUseCase,
  DeactivateServiceUseCaseResult,
} from '../../application/use-cases/deactivate-service.use-case';
import {
  GetServiceByIdUseCase,
  GetServiceByIdUseCaseResult,
} from '../../application/use-cases/get-service-by-id.use-case';
import {
  GetServicesUseCase,
  GetServicesUseCaseResult,
} from '../../application/use-cases/get-services.use-case';
import {
  UpdateServiceUseCase,
  UpdateServiceUseCaseResult,
} from '../../application/use-cases/update-service.use-case';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import { mapBookingError } from '../http/booking-error.mapper';

@Controller('services')
export class ServiceController {
  constructor(
    private readonly tenantContext: RequestContext,
    private readonly createService: CreateServiceUseCase,
    private readonly getServices: GetServicesUseCase,
    private readonly getServiceById: GetServiceByIdUseCase,
    private readonly updateService: UpdateServiceUseCase,
    private readonly deactivateService: DeactivateServiceUseCase,
  ) {}

  @Get()
  list(): Promise<GetServicesUseCaseResult> {
    const { tenantId, actorRole, settings } = this.tenantContext;
    const isStaffOrManager = actorRole === 'MANAGER' || actorRole === 'STAFF';
    return this.getServices
      .execute({
        tenantId,
        status: isStaffOrManager ? 'ANY' : 'ACTIVE',
        locale: settings.localization.language,
      })
      .catch(mapBookingError);
  }

  @Get(':id')
  @UseGuards(StaffOrManagerRoleGuard)
  getOne(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
  ): Promise<GetServiceByIdUseCaseResult> {
    return this.getServiceById
      .execute({
        id,
        tenantId: this.tenantContext.tenantId,
        locale: this.tenantContext.settings.localization.language,
      })
      .catch(mapBookingError);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(StaffOrManagerRoleGuard)
  create(
    @Body(new ZodValidationPipe(CreateServiceSchema)) body: CreateServiceDto,
  ): Promise<CreateServiceUseCaseResult> {
    return this.createService
      .execute({
        ...body,
        tenantId: this.tenantContext.tenantId,
        currency: this.tenantContext.settings.localization.currency,
        locale: this.tenantContext.settings.localization.language,
      })
      .catch(mapBookingError);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  update(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
    @Body(new ZodValidationPipe(UpdateServiceSchema)) body: UpdateServiceDto,
  ): Promise<UpdateServiceUseCaseResult> {
    return this.updateService
      .execute({
        id,
        ...body,
        tenantId: this.tenantContext.tenantId,
        currency: this.tenantContext.settings.localization.currency,
        locale: this.tenantContext.settings.localization.language,
      })
      .catch(mapBookingError);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  deactivate(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
  ): Promise<DeactivateServiceUseCaseResult> {
    return this.deactivateService
      .execute({ id, tenantId: this.tenantContext.tenantId })
      .catch(mapBookingError);
  }
}
