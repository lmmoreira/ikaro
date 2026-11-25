import { Controller, Get, Query, Res } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import type { PublicPricesResponse } from '@ikaro/types';
import type { Response } from 'express';
import { Public } from '../../shared/decorators/public.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { toPublicPricesResponse } from './billing.mapper';
import {
  BackendPublicPricesSchema,
  type PublicPricesQuery,
  PublicPricesQuerySchema,
} from './billing.public.schemas';

// The unauthenticated price list behind the public trial page (UC-128). Carries no tenant data and
// no access check of its own: the backend route is tenant-less and decides what a country may see.
@Controller('public/billing/prices')
export class BillingPublicController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  // Cacheable for five minutes (a price that becomes effective shows within that window; the query
  // string is part of the cache key, so each country is cached on its own). The header is set only
  // after the backend answered: Nest applies a declarative `@Header()` before the handler runs, so it
  // would also ride on a `400` or `503` and let a CDN keep an error for five minutes.
  @Get()
  @Public()
  async getPrices(
    @Query(new ZodValidationPipe(PublicPricesQuerySchema)) query: PublicPricesQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicPricesResponse> {
    const raw = await this.backendHttp.get<unknown>('/internal/billing/public-prices', {
      country: query.country,
    });
    const response = toPublicPricesResponse(BackendPublicPricesSchema.parse(raw));
    res.setHeader('Cache-Control', 'public, max-age=300');
    return response;
  }
}
