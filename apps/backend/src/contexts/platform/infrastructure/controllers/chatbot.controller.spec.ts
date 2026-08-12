import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RequestContext } from '../../../../shared/request/request-context';
import { TenantSettingsPropsBuilder } from '../../../../test/builders/platform/index';
import { GetChatbotStatusUseCase } from '../../application/use-cases/get-chatbot-status.use-case';
import {
  SendChatMessageUseCase,
  SendChatMessageUseCaseInput,
} from '../../application/use-cases/send-chat-message.use-case';
import { ChatbotDailyCapReachedError } from '../../domain/errors/platform-domain.error';
import { ChatbotController } from './chatbot.controller';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';

describe('ChatbotController', () => {
  let controller: ChatbotController;
  let requestContext: {
    tenantId: string;
    settings: ReturnType<TenantSettingsPropsBuilder['build']>;
  };
  let execute: jest.Mock;
  let statusExecute: jest.Mock;

  beforeEach(async () => {
    execute = jest.fn();
    statusExecute = jest.fn();
    requestContext = {
      tenantId: TENANT_ID,
      settings: new TenantSettingsPropsBuilder().build(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ChatbotController],
      providers: [
        { provide: RequestContext, useValue: requestContext },
        { provide: SendChatMessageUseCase, useValue: { execute } },
        { provide: GetChatbotStatusUseCase, useValue: { execute: statusExecute } },
      ],
    }).compile();

    controller = moduleRef.get(ChatbotController);
  });

  it('forwards tenantId, clientIp, sessionId, and message fields from the body + RequestContext', async () => {
    execute.mockResolvedValue({ sessionId: 'new-session-id', reply: 'Olá!' });

    const result = await controller.sendMessage({
      systemPrompt: 'You are a helpful assistant.',
      message: 'Vocês trabalham aos sábados?',
      clientIp: '203.0.113.10',
    });

    expect(result).toEqual({ sessionId: 'new-session-id', reply: 'Olá!' });
    const input = execute.mock.calls[0][0] as SendChatMessageUseCaseInput;
    expect(input.tenantId).toBe(TENANT_ID);
    expect(input.clientIp).toBe('203.0.113.10');
    expect(input.userMessage).toBe('Vocês trabalham aos sábados?');
    expect(input.systemPrompt).toBe('You are a helpful assistant.');
    expect(input.sessionId).toBeUndefined();
  });

  it('resolves timezone and chatbotSettings from RequestContext.settings', async () => {
    execute.mockResolvedValue({ sessionId: 'id', reply: 'ok' });
    requestContext.settings = new TenantSettingsPropsBuilder()
      .withChatbot({ knowledgeText: 'texto', llmProvider: 'anthropic' })
      .build();

    await controller.sendMessage({
      systemPrompt: 'prompt',
      message: 'oi',
      clientIp: '203.0.113.10',
    });

    const input = execute.mock.calls[0][0] as SendChatMessageUseCaseInput;
    expect(input.timezone).toBe(requestContext.settings.businessHours.timezone);
    expect(input.chatbotSettings).toEqual(requestContext.settings.chatbot);
  });

  it('defaults chatbotSettings to {} when a tenant has no chatbot settings at all', async () => {
    execute.mockResolvedValue({ sessionId: 'id', reply: 'ok' });
    delete (requestContext.settings as { chatbot?: unknown }).chatbot;

    await controller.sendMessage({
      systemPrompt: 'prompt',
      message: 'oi',
      clientIp: '203.0.113.10',
    });

    const input = execute.mock.calls[0][0] as SendChatMessageUseCaseInput;
    expect(input.chatbotSettings).toEqual({});
  });

  it('maps a cap-rejection domain error to 429 HttpException', async () => {
    execute.mockRejectedValue(new ChatbotDailyCapReachedError());

    expect.assertions(2);
    try {
      await controller.sendMessage({ systemPrompt: 'p', message: 'oi', clientIp: '203.0.113.10' });
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  describe('getStatus', () => {
    it('forwards tenantId, chatbotSettings, and timezone from RequestContext', async () => {
      statusExecute.mockResolvedValue({ available: true });
      requestContext.settings = new TenantSettingsPropsBuilder()
        .withChatbot({ knowledgeText: 'texto', llmProvider: 'anthropic' })
        .build();

      const result = await controller.getStatus();

      expect(result).toEqual({ available: true });
      const input = statusExecute.mock.calls[0][0];
      expect(input.tenantId).toBe(TENANT_ID);
      expect(input.timezone).toBe(requestContext.settings.businessHours.timezone);
      expect(input.chatbotSettings).toEqual(requestContext.settings.chatbot);
    });

    it('defaults chatbotSettings to {} when a tenant has no chatbot settings at all', async () => {
      statusExecute.mockResolvedValue({ available: true });
      delete (requestContext.settings as { chatbot?: unknown }).chatbot;

      await controller.getStatus();

      const input = statusExecute.mock.calls[0][0];
      expect(input.chatbotSettings).toEqual({});
    });
  });
});
