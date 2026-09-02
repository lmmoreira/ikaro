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
  UpdateResourceDto,
  UpdateResourceSchema,
} from '../../application/dtos/resource.dto';
import {
  CreateResourceUseCase,
  CreateResourceUseCaseResult,
} from '../../application/use-cases/create-resource.use-case';
import {
  GetResourceByIdUseCase,
  GetResourceByIdUseCaseResult,
} from '../../application/use-cases/get-resource-by-id.use-case';
import {
  UpdateResourceUseCase,
  UpdateResourceUseCaseResult,
} from '../../application/use-cases/update-resource.use-case';
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
    private readonly getResourceById: GetResourceByIdUseCase,
    private readonly updateResource: UpdateResourceUseCase,
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

  @Get(':id')
  getOne(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<GetResourceByIdUseCaseResult> {
    const { tenantId } = this.ctx;
    return this.getResourceById.execute({ id, tenantId }).catch(mapBookingError);
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
    @Body(new ZodValidationPipe(UpdateResourceSchema))
    body: UpdateResourceDto,
  ): Promise<UpdateResourceUseCaseResult> {
    const { tenantId, settings } = this.ctx;
    return this.updateResource
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
