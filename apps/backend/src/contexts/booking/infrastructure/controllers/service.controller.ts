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
  Put,
  UseGuards,
} from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import { CreateServiceDto, CreateServiceSchema } from '../../application/dtos/create-service.dto';
import { UpdateServiceDto, UpdateServiceSchema } from '../../application/dtos/update-service.dto';
import {
  UpdateServiceLegsDto,
  UpdateServiceLegsSchema,
} from '../../application/dtos/update-service-legs.dto';
import {
  UpdateServiceResourceRequirementsDto,
  UpdateServiceResourceRequirementsSchema,
} from '../../application/dtos/update-service-resource-requirements.dto';
import {
  UpdateServiceBookingPolicyDto,
  UpdateServiceBookingPolicySchema,
} from '../../application/dtos/update-service-booking-policy.dto';
import {
  PublishServiceIntakeSchemaDto,
  PublishServiceIntakeSchemaSchema,
} from '../../application/dtos/publish-service-intake-schema.dto';
import {
  ActivateServiceUseCase,
  ActivateServiceUseCaseResult,
} from '../../application/use-cases/activate-service.use-case';
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
  GetServiceIntakeSchemaUseCase,
  GetServiceIntakeSchemaUseCaseResult,
} from '../../application/use-cases/get-service-intake-schema.use-case';
import {
  GetServicesUseCase,
  GetServicesUseCaseResult,
} from '../../application/use-cases/get-services.use-case';
import {
  UpdateServiceLegsUseCase,
  UpdateServiceLegsUseCaseResult,
} from '../../application/use-cases/update-service-legs.use-case';
import {
  UpdateServiceResourceRequirementsUseCase,
  UpdateServiceResourceRequirementsUseCaseResult,
} from '../../application/use-cases/update-service-resource-requirements.use-case';
import {
  UpdateServiceBookingPolicyUseCase,
  UpdateServiceBookingPolicyUseCaseResult,
} from '../../application/use-cases/update-service-booking-policy.use-case';
import {
  PublishServiceIntakeSchemaUseCase,
  PublishServiceIntakeSchemaUseCaseResult,
} from '../../application/use-cases/publish-service-intake-schema.use-case';
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
    private readonly activateService: ActivateServiceUseCase,
    private readonly updateService: UpdateServiceUseCase,
    private readonly deactivateService: DeactivateServiceUseCase,
    private readonly updateServiceResourceRequirements: UpdateServiceResourceRequirementsUseCase,
    private readonly updateServiceLegs: UpdateServiceLegsUseCase,
    private readonly updateServiceBookingPolicy: UpdateServiceBookingPolicyUseCase,
    private readonly publishServiceIntakeSchema: PublishServiceIntakeSchemaUseCase,
    private readonly getServiceIntakeSchema: GetServiceIntakeSchemaUseCase,
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
  getOne(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<GetServiceByIdUseCaseResult> {
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
        tenantServiceBufferMinutes: this.tenantContext.settings.booking.serviceBufferMinutes,
      })
      .catch(mapBookingError);
  }

  @Patch(':id/resource-requirements')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  updateResourceRequirements(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateServiceResourceRequirementsSchema))
    body: UpdateServiceResourceRequirementsDto,
  ): Promise<UpdateServiceResourceRequirementsUseCaseResult> {
    return this.updateServiceResourceRequirements
      .execute({ ...body, id, tenantId: this.tenantContext.tenantId })
      .catch(mapBookingError);
  }

  @Put(':id/legs')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  updateLegs(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateServiceLegsSchema)) body: UpdateServiceLegsDto,
  ): Promise<UpdateServiceLegsUseCaseResult> {
    return this.updateServiceLegs
      .execute({ ...body, id, tenantId: this.tenantContext.tenantId })
      .catch(mapBookingError);
  }

  @Patch(':id/booking-policy')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  updateBookingPolicy(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateServiceBookingPolicySchema))
    body: UpdateServiceBookingPolicyDto,
  ): Promise<UpdateServiceBookingPolicyUseCaseResult> {
    return this.updateServiceBookingPolicy
      .execute({ ...body, id, tenantId: this.tenantContext.tenantId })
      .catch(mapBookingError);
  }

  @Post(':id/intake-schema')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(StaffOrManagerRoleGuard)
  publishIntakeSchema(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(PublishServiceIntakeSchemaSchema))
    body: PublishServiceIntakeSchemaDto,
  ): Promise<PublishServiceIntakeSchemaUseCaseResult> {
    return this.publishServiceIntakeSchema
      .execute({ ...body, id, tenantId: this.tenantContext.tenantId })
      .catch(mapBookingError);
  }

  @Get(':id/intake-schema')
  @UseGuards(StaffOrManagerRoleGuard)
  getIntakeSchema(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<GetServiceIntakeSchemaUseCaseResult> {
    return this.getServiceIntakeSchema
      .execute({ id, tenantId: this.tenantContext.tenantId })
      .catch(mapBookingError);
  }

  // UC-068 step 1 (M23-S02) — customer/guest-facing, no guard. Distinct path from the
  // staff-facing route above (same path can't carry two handlers/guards) and a narrower response:
  // `active` only, never `history` — a customer has no reason to see prior form versions.
  // Reuses GetServiceIntakeSchemaUseCase as-is rather than a dedicated use case (story-discovery).
  @Get(':id/intake-schema/public')
  async getPublicIntakeSchema(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<Pick<GetServiceIntakeSchemaUseCaseResult, 'active'>> {
    const { active } = await this.getServiceIntakeSchema
      .execute({ id, tenantId: this.tenantContext.tenantId })
      .catch(mapBookingError);
    return { active };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  update(
    @Param('id', CanonicalParseUUIDPipe) id: string,
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

  @Patch(':id/activate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  activate(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<ActivateServiceUseCaseResult> {
    return this.activateService
      .execute({
        id,
        tenantId: this.tenantContext.tenantId,
      })
      .catch(mapBookingError);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  deactivate(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<DeactivateServiceUseCaseResult> {
    return this.deactivateService
      .execute({ id, tenantId: this.tenantContext.tenantId })
      .catch(mapBookingError);
  }
}
