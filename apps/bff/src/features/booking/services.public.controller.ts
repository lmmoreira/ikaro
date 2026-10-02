import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import {
  HotsiteServiceListResponse,
  HotsiteServiceQuoteResponse,
  HotsiteServiceResourceOptionsResponse,
  PublicServiceIntakeSchemaResponse,
} from '@ikaro/types';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { Public } from '../../shared/decorators/public.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { withPublicTenant } from '../../shared/http/public-tenant';
import { QuoteQuery, QuoteQuerySchema } from './services.schemas';
import {
  GetPublicServiceIntakeSchemaResult,
  GetServiceQuoteResult,
  GetServiceResourceOptionsResult,
  ServiceListResponse,
} from './services.types';
import {
  toPublicServiceIntakeSchemaResponse,
  toPublicServiceListResponse,
  toPublicServiceQuoteResponse,
  toPublicServiceResourceOptionsResponse,
} from './services.mapper';

@Controller('public/services')
export class ServicesPublicController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  @Get()
  @Public()
  async list(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
  ): Promise<HotsiteServiceListResponse> {
    return withPublicTenant(this.backendHttp, tenantSlug, async (tenantId) =>
      toPublicServiceListResponse(
        await this.backendHttp.getForPublic<ServiceListResponse>('/services', tenantId),
      ),
    );
  }

  // What a customer may pick for each CUSTOMER_CHOICE requirement (id and name only).
  @Get(':id/resource-options')
  @Public()
  async getResourceOptions(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<HotsiteServiceResourceOptionsResponse> {
    return withPublicTenant(this.backendHttp, tenantSlug, async (tenantId) =>
      toPublicServiceResourceOptionsResponse(
        await this.backendHttp.getForPublic<GetServiceResourceOptionsResult>(
          `/services/${id}/resource-options`,
          tenantId,
        ),
      ),
    );
  }

  // The price/duration booking creation would persist for the chosen duration.
  @Get(':id/quote')
  @Public()
  async getQuote(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(QuoteQuerySchema)) query: QuoteQuery,
  ): Promise<HotsiteServiceQuoteResponse> {
    return withPublicTenant(this.backendHttp, tenantSlug, async (tenantId) =>
      toPublicServiceQuoteResponse(
        await this.backendHttp.getForPublic<GetServiceQuoteResult>(
          `/services/${id}/quote`,
          tenantId,
          query,
        ),
      ),
    );
  }

  // UC-068 step 1 (M23-S02) — active version only, never history (a customer has no reason to
  // see prior form versions; the staff-facing equivalent lives on the authenticated
  // services.controller.ts, backed by a different backend path).
  @Get(':id/intake-schema')
  @Public()
  async getIntakeSchema(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<PublicServiceIntakeSchemaResponse> {
    return withPublicTenant(this.backendHttp, tenantSlug, async (tenantId) => {
      const result = await this.backendHttp.getForPublic<GetPublicServiceIntakeSchemaResult>(
        `/services/${id}/intake-schema/public`,
        tenantId,
      );
      return toPublicServiceIntakeSchemaResponse(result);
    });
  }
}
