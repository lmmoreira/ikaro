import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  GetTenantByIdUseCase,
  GetTenantByIdUseCaseResult,
} from '../../application/use-cases/get-tenant-by-id.use-case';
import {
  GetTenantBySlugUseCase,
  GetTenantBySlugUseCaseResult,
} from '../../application/use-cases/get-tenant-by-slug.use-case';
import {
  GetTenantsByIdsUseCase,
  GetTenantsByIdsUseCaseResult,
} from '../../application/use-cases/get-tenants-by-ids.use-case';
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
    private readonly getTenantsByIds: GetTenantsByIdsUseCase,
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

  // Batch lookup — used by BFF to resolve multiple tenant IDs in a single call.
  // Must be declared before :tenantId to avoid route shadowing.
  @Get()
  async getTenantsByIdsRoute(
    @Query('ids') ids: string | undefined,
  ): Promise<GetTenantsByIdsUseCaseResult[]> {
    if (!ids?.trim()) {
      throw new BadRequestException({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'ids query parameter is required',
      });
    }
    const tenantIds = ids
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (tenantIds.length === 0) {
      throw new BadRequestException({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'ids query parameter is required',
      });
    }
    return this.getTenantsByIds.execute(tenantIds).catch(mapPlatformError);
  }

  @Get(':tenantId')
  getTenant(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
  ): Promise<GetTenantByIdUseCaseResult> {
    return this.getTenantById.execute(tenantId).catch(mapPlatformError);
  }
}
