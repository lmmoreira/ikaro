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
  Query,
  UseGuards,
} from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import {
  CreateResourceDto,
  CreateResourceSchema,
  ListResourcesDto,
  ListResourcesSchema,
  UpdateResourceWorkingHoursDto,
  UpdateResourceWorkingHoursSchema,
} from '../../application/dtos/resource.dto';
import {
  CreateResourceUseCase,
  CreateResourceUseCaseResult,
} from '../../application/use-cases/create-resource.use-case';
import {
  UpdateResourceWorkingHoursUseCase,
  UpdateResourceWorkingHoursUseCaseResult,
} from '../../application/use-cases/update-resource-working-hours.use-case';
import { DeactivateResourceUseCase } from '../../application/use-cases/deactivate-resource.use-case';
import {
  ReactivateResourceUseCase,
  ReactivateResourceUseCaseResult,
} from '../../application/use-cases/reactivate-resource.use-case';
import {
  ListResourcesUseCase,
  ListResourcesUseCaseResult,
} from '../../application/use-cases/list-resources.use-case';
import { mapBookingError } from '../http/booking-error.mapper';

@Controller('resources')
@UseGuards(ManagerRoleGuard)
export class ResourceController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly createResource: CreateResourceUseCase,
    private readonly updateWorkingHours: UpdateResourceWorkingHoursUseCase,
    private readonly deactivateResource: DeactivateResourceUseCase,
    private readonly reactivateResource: ReactivateResourceUseCase,
    private readonly listResources: ListResourcesUseCase,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListResourcesSchema)) query: ListResourcesDto,
  ): Promise<ListResourcesUseCaseResult> {
    const { tenantId } = this.ctx;
    return this.listResources.execute({ ...query, tenantId }).catch(mapBookingError);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(CreateResourceSchema)) body: CreateResourceDto,
  ): Promise<CreateResourceUseCaseResult> {
    const { tenantId, settings } = this.ctx;
    return this.createResource
      .execute({ ...body, tenantId, tenantBusinessHours: settings.businessHours })
      .catch(mapBookingError);
  }

  @Patch(':id')
  update(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateResourceWorkingHoursSchema))
    body: UpdateResourceWorkingHoursDto,
  ): Promise<UpdateResourceWorkingHoursUseCaseResult> {
    const { tenantId, settings } = this.ctx;
    return this.updateWorkingHours
      .execute({ ...body, id, tenantId, tenantBusinessHours: settings.businessHours })
      .catch(mapBookingError);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<void> {
    const { tenantId } = this.ctx;
    return this.deactivateResource.execute({ id, tenantId }).catch(mapBookingError);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<ReactivateResourceUseCaseResult> {
    const { tenantId } = this.ctx;
    return this.reactivateResource.execute({ id, tenantId }).catch(mapBookingError);
  }
}
