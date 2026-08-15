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
import {
  getBusinessInfoContext,
  getKnowledgeTextContext,
  getServicesContext,
} from './chatbot-context';
import { buildSystemPrompt } from './chatbot.mapper';
import { BackendHotsiteManifestResponse } from './platform.types';

// message's real, tenant-resolved cap (maxMessageLengthChars) is enforced by the backend, the real
// backstop (docs/discovery/CHATBOT/CHATBOT.md §8 layer 5) — this 1000-char default is
// defense-in-depth only, rejecting the common case before any network hop, never the tenant's
// real (possibly Ikaro-overridden) cap.
const ChatbotMessageBodySchema = z.object({
  sessionId: z.uuid().optional(),
  message: z.string().min(1).max(1000),
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
  // (docs/14-API_CONTRACTS.md § Chatbot Widget).
  @Get('chatbot/status')
  @Public()
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
      const [services, business, knowledgeText] = await Promise.all([
        getServicesContext(this.backendHttp, tenantId),
        getBusinessInfoContext(this.backendHttp, tenantId),
        getKnowledgeTextContext(this.backendHttp, tenantId),
      ]);

      const systemPrompt = buildSystemPrompt({
        businessInfo: business.businessInfo,
        businessHours: business.businessHours,
        services,
        knowledgeText,
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
