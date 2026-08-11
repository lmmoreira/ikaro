import { Decimal } from 'decimal.js';
import {
  ChatbotMessage,
  ChatbotMessageRole,
} from '../../../contexts/platform/domain/chatbot-message.aggregate';

const DEFAULT_TENANT_ID = '01234567-0000-7000-8000-000000000001';
const DEFAULT_SESSION_ID = '01234567-0000-7000-8000-000000000002';
const DEFAULT_MODEL_ID = 'deepseek/deepseek-v4-flash-0731';

export class ChatbotMessageBuilder {
  private tenantId = DEFAULT_TENANT_ID;
  private sessionId = DEFAULT_SESSION_ID;
  private role: ChatbotMessageRole = 'USER';
  private content = 'Quais são os horários de funcionamento?';
  private inputTokens = 42;
  private outputTokens = 0;
  private modelId = DEFAULT_MODEL_ID;
  private costUsd = new Decimal('0.00000378');

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withSessionId(sessionId: string): this {
    this.sessionId = sessionId;
    return this;
  }

  withRole(role: ChatbotMessageRole): this {
    this.role = role;
    return this;
  }

  withContent(content: string): this {
    this.content = content;
    return this;
  }

  withInputTokens(inputTokens: number): this {
    this.inputTokens = inputTokens;
    return this;
  }

  withOutputTokens(outputTokens: number): this {
    this.outputTokens = outputTokens;
    return this;
  }

  withModelId(modelId: string): this {
    this.modelId = modelId;
    return this;
  }

  withCostUsd(costUsd: Decimal | number | string): this {
    this.costUsd = new Decimal(costUsd);
    return this;
  }

  build(): ChatbotMessage {
    const message = ChatbotMessage.create({
      tenantId: this.tenantId,
      sessionId: this.sessionId,
      role: this.role,
      content: this.content,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      modelId: this.modelId,
      costUsd: this.costUsd,
    });
    message.clearDomainEvents();
    return message;
  }
}
