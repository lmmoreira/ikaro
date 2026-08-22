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
import {
  HotsiteChatbotMessageResponse,
  HotsiteChatbotStatusResponse,
  HotsiteManifestResponse,
  HotsiteSitemapEntryListResponse,
} from '@ikaro/types';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { Public } from '../../shared/decorators/public.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { ClientIpRequest, getClientIp } from '../../shared/http/client-ip';
import { withPublicTenant } from '../../shared/http/public-tenant';
import { TenantInfoResponse } from '../../shared/types/backend-responses';
import { getBusinessContext, getServicesContext } from './chatbot-context';
import { buildSystemPrompt } from './chatbot.mapper';
import { BackendHotsiteManifestResponse, BackendSendChatMessageBody } from './platform.types';
import { ChatbotMessageBody, ChatbotMessageBodySchema } from './platform.public.schemas';

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
  constructor(private readonly backendHttp: BackendHttpService) {}

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
}
