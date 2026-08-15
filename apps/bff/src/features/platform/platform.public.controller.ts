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
import { z } from 'zod';
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
import { BackendHotsiteManifestResponse } from './platform.types';

// `maxMessageLengthChars` (default 1000) is an Ikaro-only override (docs/21-TENANTS_SETTINGS_SCHEMA.md
// §7 — "No" tenant-editable, set only via a direct DB update, never returned by any BFF-reachable
// read) — the BFF has no way to know a tenant's real resolved value, so it must never guess at a
// business-rule ceiling here (same reasoning §7 already applies to knowledgeText/maxKnowledgeTextLength:
// a static bound at this layer must never be the tenant's real cap, or an above-default override
// would be silently unenforceable). This 5000 mirrors the backend's own SendChatMessageSchema outer
// bound — an absurd-payload sanity guard only. The real, tenant-resolved rejection happens
// backend-side in SendChatMessageUseCase, still before any LLM call (PR #373 review, Codex).
const ChatbotMessageBodySchema = z.object({
  sessionId: z.uuid().optional(),
  message: z.string().min(1).max(5000),
});

type ChatbotMessageBody = z.infer<typeof ChatbotMessageBodySchema>;

interface BackendSendChatMessageBody {
  sessionId?: string;
  systemPrompt: string;
  message: string;
  clientIp: string;
}

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
      );
    });
  }
}
