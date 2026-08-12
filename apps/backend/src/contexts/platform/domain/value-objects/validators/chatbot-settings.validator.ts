import { PlatformErrorCode } from '@ikaro/types/protocol/errors';
import type { ChatbotSettings } from '../../../../../shared/value-objects/tenant-settings-data';
import { DEFAULT_MAX_KNOWLEDGE_TEXT_LENGTH } from '../../../chatbot.constants';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';

export class ChatbotSettingsValidator {
  static validate(chatbot: ChatbotSettings | undefined): void {
    if (!chatbot?.knowledgeText) return;
    const maxLength = chatbot.maxKnowledgeTextLength ?? DEFAULT_MAX_KNOWLEDGE_TEXT_LENGTH;
    if (chatbot.knowledgeText.length > maxLength) {
      throw new TenantSettingsValidationError(
        `chatbot.knowledgeText must be at most ${maxLength} characters`,
        PlatformErrorCode.SETTINGS_CHATBOT_KNOWLEDGE_TEXT_TOO_LONG,
        'chatbot.knowledgeText',
      );
    }
  }
}
