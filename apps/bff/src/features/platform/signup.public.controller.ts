import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AuthErrorCode,
  SignupErrorCode,
  type SignupSessionResponse,
  type SignupTenantResponse,
  type SlugAvailabilityResponse,
} from '@ikaro/types';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { SignupSession, SignupSessionService } from '../auth/signup-session.service';
import { Public } from '../../shared/decorators/public.decorator';
import { ThrottleErrorCode } from '../../shared/decorators/throttle-error-code.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { getClientIp } from '../../shared/http/client-ip';
import { throwProblemDetail } from '../../shared/http/problem-detail';
import {
  SignupTenantBody,
  SignupTenantBodySchema,
  SlugAvailabilityQuery,
  SlugAvailabilityQuerySchema,
} from './signup.public.schemas';
import type { BackendSignupEligibility } from './platform.types';
import { SignupService } from './signup.service';

// The unauthenticated routes behind the public trial page (UC-127, UC-128). Named by resource, not
// `platform.public.controller.ts` (which serves the hotsite manifest): the signup routes are one
// resource that spans Platform and Billing and that S24 and S25 extend
// (docs/BFF_ARCHITECTURE.md § Module & Controller Naming Conventions).
@Controller('public/signup')
export class SignupPublicController {
  constructor(
    private readonly backendHttp: BackendHttpService,
    private readonly signupSessions: SignupSessionService,
    private readonly signup: SignupService,
  ) {}

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

  // The verified Google identity of the in-progress signup, plus the read-only trial answer
  // (UC-127). Nothing is reserved here: the tax-id half of the trial rule runs at the reservation.
  // Per-visitor data, so never cached.
  @Get('session')
  @Public()
  @Header('Cache-Control', 'no-store')
  async getSession(@Req() req: Request): Promise<SignupSessionResponse> {
    const session = this.requireSession(req);
    const eligibility = await this.backendHttp.get<BackendSignupEligibility>(
      '/internal/billing/registrations/eligibility',
      { googleSub: session.googleSub },
    );
    return {
      email: session.email,
      name: session.name,
      trialAvailable: eligibility.trialAvailable,
      ...(eligibility.existingTenantSlug
        ? { existingTenantSlug: eligibility.existingTenantSlug }
        : {}),
      termsVersion: eligibility.termsVersion,
    };
  }

  // 10 per minute per IP on the existing in-memory throttler (best-effort, per instance); the hard
  // controls are Turnstile, the trial rule and the per-tax-id rule. The visitor's email and name come
  // from the signup session, never from the body. The signup cookie is replaced by the resend
  // credential only on success.
  @Post('tenant')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ThrottleErrorCode(SignupErrorCode.RATE_LIMITED)
  @Header('Cache-Control', 'no-store')
  async createTenant(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(SignupTenantBodySchema)) body: SignupTenantBody,
  ): Promise<SignupTenantResponse> {
    const session = this.requireSession(req);
    const { tenantId, tenantSlug, nextPath } = await this.signup.signup(
      session,
      body,
      getClientIp(req),
    );
    this.signupSessions.clearSession(res);
    this.signupSessions.issueResendCredential(res, { tenantId, email: session.email });
    return { tenantSlug, nextPath };
  }

  private requireSession(req: Request): SignupSession {
    const session = this.signupSessions.readSession(req);
    if (!session) {
      throw throwProblemDetail(
        HttpStatus.UNAUTHORIZED,
        AuthErrorCode.UNAUTHORIZED,
        'No signup session. Sign in with Google to start.',
      );
    }
    return session;
  }
}
