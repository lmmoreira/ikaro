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
} from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { ResourceListResponse, ResourceResponse } from './resource.types';
import {
  CreateResourceBody,
  CreateResourceBodySchema,
  ListResourcesQuery,
  ListResourcesQuerySchema,
  UpdateResourceBody,
  UpdateResourceBodySchema,
} from './resource.schemas';

// Request Zod schemas moved to resource.schemas.ts — re-exported here so existing imports of
// these symbols from this file keep working unchanged (mirrors schedule-opening.controller.ts).
export * from './resource.schemas';

@Controller('resources')
@Roles('MANAGER')
export class ResourceController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(ListResourcesQuerySchema)) query: ListResourcesQuery,
  ): Promise<ResourceListResponse> {
    return this.backendHttp.get<ResourceListResponse>('/resources', query);
  }

  @Get(':id')
  getById(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<ResourceResponse> {
    return this.backendHttp.get<ResourceResponse>(`/resources/${id}`);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(CreateResourceBodySchema)) body: CreateResourceBody,
  ): Promise<ResourceResponse> {
    return this.backendHttp.post<ResourceResponse>('/resources', body);
  }

  @Patch(':id')
  update(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateResourceBodySchema))
    body: UpdateResourceBody,
  ): Promise<ResourceResponse> {
    return this.backendHttp.patch<ResourceResponse>(`/resources/${id}`, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<void> {
    return this.backendHttp.delete<void>(`/resources/${id}`);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id', CanonicalParseUUIDPipe) id: string): Promise<ResourceResponse> {
    return this.backendHttp.post<ResourceResponse>(`/resources/${id}/reactivate`, {});
  }
}
