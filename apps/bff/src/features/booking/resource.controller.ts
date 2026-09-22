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
import { ResourceStaffOptionsResponse } from '@ikaro/types';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { StaffItemListResponse } from '../staff/staff.types';
import { ResourceListResponse, ResourceResponse } from './resource.types';
import { toResourceStaffOptionsResponse } from './resource.mapper';
import {
  CreateResourceBody,
  CreateResourceBodySchema,
  ListResourcesQuery,
  ListResourcesQuerySchema,
  StaffOptionsQuery,
  StaffOptionsQuerySchema,
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

  // Declared before ':id' — a dynamic segment declared first would swallow this literal path
  // (see ANTI_PATTERNS.md, matches StaffController's 'me' route precedent).
  //
  // Merges Staff + Resource reads here so the STAFF picker on Resource create/edit forms never
  // needs apps/web to orchestrate two BFF calls itself (docs/24-BFF_ARCHITECTURE.md § Web-facing
  // composite views).
  @Get('staff-options')
  async staffOptions(
    @Query(new ZodValidationPipe(StaffOptionsQuerySchema)) query: StaffOptionsQuery,
  ): Promise<ResourceStaffOptionsResponse> {
    const [staffList, resourceList] = await Promise.all([
      this.backendHttp.get<StaffItemListResponse>('/staff', { limit: 100, offset: 0 }),
      this.backendHttp.get<ResourceListResponse>('/resources', { type: 'STAFF' }),
    ]);

    return toResourceStaffOptionsResponse(
      staffList.items,
      resourceList.items,
      query.excludeResourceId,
    );
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
