import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  GetTenantByIdUseCase,
  GetTenantByIdUseCaseResult,
} from '../../application/use-cases/get-tenant-by-id.use-case';
import {
  GetTenantBySlugUseCase,
  GetTenantBySlugUseCaseResult,
} from '../../application/use-cases/get-tenant-by-slug.use-case';
import {
  ListPublishedHotsitesUseCase,
  ListPublishedHotsitesUseCaseResult,
} from '../../application/use-cases/list-published-hotsites.use-case';
import { mapPlatformError } from '../http/platform-error.mapper';

@Controller('internal/tenants')
export class InternalTenantReadController {
  constructor(
    private readonly getTenantById: GetTenantByIdUseCase,
    private readonly getTenantBySlug: GetTenantBySlugUseCase,
    private readonly listPublishedHotsites: ListPublishedHotsitesUseCase,
  ) {}

  // Static routes must be declared before the dynamic :tenantId route
  @Get('by-slug/:slug')
  getTenantBySlugRoute(@Param('slug') slug: string): Promise<GetTenantBySlugUseCaseResult> {
    return this.getTenantBySlug.execute(slug).catch(mapPlatformError);
  }

  @Get('published-hotsites')
  getPublishedHotsites(): Promise<ListPublishedHotsitesUseCaseResult> {
    return this.listPublishedHotsites.execute().catch(mapPlatformError);
  }

  @Get(':tenantId')
  getTenant(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
  ): Promise<GetTenantByIdUseCaseResult> {
    return this.getTenantById.execute(tenantId).catch(mapPlatformError);
  }
}
