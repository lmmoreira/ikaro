import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { ChatbotMessageEntity } from '../../../contexts/platform/infrastructure/entities/chatbot-message.entity';

export class ChatbotMessageEntityBuilder {
  private id = uuidv7();
  private sessionId = uuidv7();
  private tenantId = 'tenant-id-1';
  private role = 'USER';
  private content = 'Quais são os horários de funcionamento?';
  private inputTokens = 12;
  private outputTokens = 0;
  private modelId = 'deepseek/deepseek-v4-flash-0731';
  private costUsd = '0.00000108';
  private readonly createdAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withSessionId(sessionId: string): this {
    this.sessionId = sessionId;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withRole(role: string): this {
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

  withCostUsd(costUsd: string): this {
    this.costUsd = costUsd;
    return this;
  }

  build(): ChatbotMessageEntity {
    const e = new ChatbotMessageEntity();
    e.id = this.id;
    e.sessionId = this.sessionId;
    e.tenantId = this.tenantId;
    e.role = this.role;
    e.content = this.content;
    e.inputTokens = this.inputTokens;
    e.outputTokens = this.outputTokens;
    e.modelId = this.modelId;
    e.costUsd = this.costUsd;
    e.createdAt = this.createdAt;
    return e;
  }
}
