import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BffErrorCode,
  HotsiteChatbotMessageResponse,
  HotsiteChatbotStatusResponse,
  HotsiteLeadFormConfigResponse,
  HotsiteLeadFormSubmissionResponse,
  HotsiteManifestResponse,
  HotsiteSitemapEntryListResponse,
} from '@ikaro/types';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { decodeUserJwt } from '../../shared/auth/decode-user-jwt';
import { Public } from '../../shared/decorators/public.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { ClientIpRequest, getClientIp } from '../../shared/http/client-ip';
import { throwProblemDetail } from '../../shared/http/problem-detail';
import { withPublicTenant } from '../../shared/http/public-tenant';
import { TenantInfoResponse } from '../../shared/types/backend-responses';
import { getBusinessContext, getServicesContext } from './chatbot-context';
import { buildSystemPrompt } from './chatbot.mapper';
import {
  BackendHotsiteManifestResponse,
  BackendSendChatMessageBody,
  BackendSubmitLeadFormBody,
} from './platform.types';
import {
  ChatbotMessageBody,
  ChatbotMessageBodySchema,
  SubmitLeadFormBody,
  SubmitLeadFormBodySchema,
} from './platform.public.schemas';
import { TurnstileService } from './turnstile.service';

// Request Zod schema moved to platform.public.schemas.ts — re-exported here so
// existing imports of these symbols from this file keep working unchanged.
export * from './platform.public.schemas';

// Above the shared 10s default (BackendHttpService's other calls): the backend's own
// per-OpenRouter-attempt timeout is 8s (OPENROUTER_TIMEOUT_MS), so a single genuine slow-but-real
// completion can legitimately take close to that before the backend responds at all. 12s gives
// that headroom plus margin for the BFF<->backend hop itself, so a real (if slow) answer isn't
// cut off here and reported as "unavailable" while the backend was still going to succeed.
export const CHATBOT_MESSAGE_TIMEOUT_MS = 12_000;

@Controller('public/platform')
export class PlatformPublicController {
  private readonly jwtSecret: string;

  constructor(
    private readonly backendHttp: BackendHttpService,
    private readonly turnstileService: TurnstileService,
    private readonly config: ConfigService,
  ) {
    this.jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
  }

  @Get('manifest/:slug')
  @Public()
  @Header('Cache-Control', 'public, max-age=300')
  async getManifest(@Param('slug') slug: string): Promise<HotsiteManifestResponse> {
    const tenant = await this.backendHttp.get<TenantInfoResponse>(
      `/internal/tenants/by-slug/${slug}`,
    );
    const hotsite = await this.backendHttp.getForPublic<BackendHotsiteManifestResponse>(
      '/hotsite',
      tenant.id,
    );
    return { tenant, ...hotsite };
  }

  @Get('published-hotsites')
  @Public()
  @Header('Cache-Control', 'public, max-age=300')
  getPublishedHotsites(): Promise<HotsiteSitemapEntryListResponse> {
    return this.backendHttp.get<HotsiteSitemapEntryListResponse>(
      '/internal/tenants/published-hotsites',
    );
  }

  // Never cached — always evaluates live state, unlike the 5-minute-cached manifest above
  // (docs/14-API_CONTRACTS.md § Chatbot Widget). Explicit no-store, not just an absent header,
  // so no intermediate HTTP cache can ever serve a stale "available: true" (PR #373 review, Codex).
  @Get('chatbot/status')
  @Public()
  @Header('Cache-Control', 'no-store')
  getChatbotStatus(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
  ): Promise<HotsiteChatbotStatusResponse> {
    return withPublicTenant(this.backendHttp, tenantSlug, (tenantId) =>
      this.backendHttp.getForPublic<HotsiteChatbotStatusResponse>(
        '/platform/chatbot/status',
        tenantId,
      ),
    );
  }

  @Post('chatbot/messages')
  @Public()
  @HttpCode(HttpStatus.OK)
  sendChatbotMessage(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
    @Body(new ZodValidationPipe(ChatbotMessageBodySchema)) body: ChatbotMessageBody,
    @Req() req: ClientIpRequest,
  ): Promise<HotsiteChatbotMessageResponse> {
    return withPublicTenant(this.backendHttp, tenantSlug, async (tenantId) => {
      const [services, business] = await Promise.all([
        getServicesContext(this.backendHttp, tenantId),
        getBusinessContext(this.backendHttp, tenantId),
      ]);

      const systemPrompt = buildSystemPrompt({
        businessInfo: business.businessInfo,
        businessHours: business.businessHours,
        services,
        knowledgeText: business.knowledgeText,
        locale: business.locale,
      });

      const backendBody: BackendSendChatMessageBody = {
        sessionId: body.sessionId,
        systemPrompt,
        message: body.message,
        clientIp: getClientIp(req),
      };

      return this.backendHttp.postForPublic<HotsiteChatbotMessageResponse>(
        '/platform/chatbot/messages',
        backendBody,
        tenantId,
        CHATBOT_MESSAGE_TIMEOUT_MS,
      );
    });
  }

  @Get('lead-form/:slug')
  @Public()
  getLeadFormConfig(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
  ): Promise<HotsiteLeadFormConfigResponse> {
    return withPublicTenant(this.backendHttp, tenantSlug, (tenantId) =>
      this.backendHttp.getForPublic<HotsiteLeadFormConfigResponse>(
        '/platform/lead-form/config',
        tenantId,
      ),
    );
  }

  @Post('lead-form/:slug/submissions')
  @Public()
  @HttpCode(HttpStatus.OK)
  async submitLeadForm(
    @Headers('x-tenant-slug') tenantSlug: string | undefined,
    @Headers('authorization') authHeader: string | undefined,
    @Body(new ZodValidationPipe(SubmitLeadFormBodySchema)) body: SubmitLeadFormBody,
    @Req() req: ClientIpRequest,
  ): Promise<HotsiteLeadFormSubmissionResponse> {
    const ipAddress = getClientIp(req);

    // Verified before the tenant is even resolved — never reaches the backend on a
    // failed/expired token (docs/14-API_CONTRACTS.md § Lead Form Widget).
    const verified = await this.turnstileService.verify(body.turnstileToken, ipAddress);
    if (!verified) {
      throw throwProblemDetail(
        HttpStatus.BAD_REQUEST,
        BffErrorCode.TURNSTILE_VERIFICATION_FAILED,
        'Turnstile verification failed or expired',
      );
    }

    // Read-only identification, not an auth requirement — this route stays @Public(). The
    // CUSTOMER_ONLY gate lives entirely backend-side (SubmitLeadFormUseCase), which already
    // re-reads LeadFormConfig for answer enrichment.
    const user = decodeUserJwt(authHeader, this.jwtSecret);

    return withPublicTenant(this.backendHttp, tenantSlug, (tenantId) => {
      // A decoded JWT is only trusted as this submission's customer identity when it's both a
      // genuine CUSTOMER token (never STAFF/MANAGER — PR #423 review, Codex) and scoped to the
      // *resolved* tenant (never a customer of a different tenant browsing this one's public
      // hotsite — PR #423 review, CodeRabbit: @Public() bypasses TenantGuard, so nothing else
      // checks this). Any mismatch is treated as an anonymous guest, never rejected outright —
      // a customer of tenant A visiting tenant B's site is a normal, benign scenario.
      const customerId =
        user && user.role === 'CUSTOMER' && user.tenantId === tenantId ? user.sub : null;

      const backendBody: BackendSubmitLeadFormBody = {
        name: body.name,
        email: body.email,
        phone: body.phone,
        answers: body.answers,
        customerId,
        ipAddress,
      };
      return this.backendHttp.postForPublic<HotsiteLeadFormSubmissionResponse>(
        '/platform/lead-form/submissions',
        backendBody,
        tenantId,
      );
    });
  }
}
