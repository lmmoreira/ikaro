import { Controller, Get, Header, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { SlugAvailabilityResponse } from '@ikaro/types';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { Public } from '../../shared/decorators/public.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { SlugAvailabilityQuery, SlugAvailabilityQuerySchema } from './signup.public.schemas';

// The unauthenticated routes behind the public trial page (UC-127, UC-128). Named by resource, not
// `platform.public.controller.ts` (which serves the hotsite manifest): the signup routes are one
// resource that spans Platform and Billing and that S24 and S25 extend
// (docs/BFF_ARCHITECTURE.md § Module & Controller Naming Conventions).
@Controller('public/signup')
export class SignupPublicController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  // 30 requests per minute per IP, through the in-memory throttler: best-effort (per instance), the
  // hard limits are Turnstile and the per-Google lock on the final signup POST. A web form that
  // re-checks each suggestion leaves room. Turnstile is deliberately not verified here.
  // `no-store`: a cached `available` would be wrong the moment someone takes the slug.
  @Get('slug-availability')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  getSlugAvailability(
    @Query(new ZodValidationPipe(SlugAvailabilityQuerySchema)) query: SlugAvailabilityQuery,
  ): Promise<SlugAvailabilityResponse> {
    return this.backendHttp.get<SlugAvailabilityResponse>('/internal/signup/slug-availability', {
      slug: query.slug,
    });
  }
}
