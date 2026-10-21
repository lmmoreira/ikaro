import type { ChatbotSettings } from '../../../../shared/value-objects/tenant-settings-data';

export interface SendChatMessageUseCaseInput {
  tenantId: string;
  clientIp: string;
  sessionId?: string;
  systemPrompt: string;
  userMessage: string;
  chatbotSettings: ChatbotSettings;
  /** Tenant's businessHours.timezone — for computing the tenant-local conversation_date bucket. */
  timezone: string;
}
