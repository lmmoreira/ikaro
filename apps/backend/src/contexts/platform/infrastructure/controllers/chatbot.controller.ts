import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  SendChatMessageDto,
  SendChatMessageSchema,
} from '../../application/dtos/send-chat-message.dto';
import {
  GetChatbotStatusUseCase,
  GetChatbotStatusUseCaseResult,
} from '../../application/use-cases/get-chatbot-status.use-case';
import {
  SendChatMessageUseCase,
  SendChatMessageUseCaseResult,
} from '../../application/use-cases/send-chat-message.use-case';
import { mapPlatformError } from '../http/platform-error.mapper';

// Bare route, no `/public/` prefix — that convention is BFF-only (`.public.controller.ts`).
// Guest-reachable the same way ServiceController/TenantSettingsController already are: tenantId
// and settings.chatbot come from RequestContext (populated per-request regardless of whether an
// actor exists), not from a route guard. `messages` is the route S09's BFF calls via
// BackendHttpService.postForPublic('/platform/chatbot/messages', body, tenantId); `status`
// (M19-S06) is the route it calls via getForPublic('/platform/chatbot/status', tenantId).
@Controller('platform/chatbot')
export class ChatbotController {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly sendChatMessage: SendChatMessageUseCase,
    private readonly getChatbotStatus: GetChatbotStatusUseCase,
  ) {}

  @Post('messages')
  @HttpCode(HttpStatus.OK)
  sendMessage(
    @Body(new ZodValidationPipe(SendChatMessageSchema)) body: SendChatMessageDto,
  ): Promise<SendChatMessageUseCaseResult> {
    const { tenantId, settings } = this.requestContext;
    return this.sendChatMessage
      .execute({
        tenantId,
        clientIp: body.clientIp,
        sessionId: body.sessionId,
        systemPrompt: body.systemPrompt,
        userMessage: body.message,
        chatbotSettings: settings.chatbot ?? {},
        timezone: settings.businessHours.timezone,
      })
      .catch(mapPlatformError);
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  getStatus(): Promise<GetChatbotStatusUseCaseResult> {
    const { tenantId, settings } = this.requestContext;
    return this.getChatbotStatus
      .execute({
        tenantId,
        chatbotSettings: settings.chatbot ?? {},
        timezone: settings.businessHours.timezone,
      })
      .catch(mapPlatformError);
  }
}
