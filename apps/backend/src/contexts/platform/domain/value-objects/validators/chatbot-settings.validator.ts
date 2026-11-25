import { PlatformErrorCode } from '@ikaro/types/protocol/errors';
import type { ChatbotSettings } from '../../../../../shared/value-objects/tenant-settings-data';
import {
  CHATBOT_OVERRIDE_PROVIDER_MODELS,
  DEFAULT_MAX_KNOWLEDGE_TEXT_LENGTH,
} from '../../../chatbot.constants';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';

export class ChatbotSettingsValidator {
  // Deliberately validates `knowledgeText` only. The operator's LLM override (`llmProvider` /
  // `llmModel`) is NOT checked here: `TenantSettings.create()` also runs on every manager PATCH
  // (the stored settings are merged with the patch first), so a check here would fail an
  // unrelated settings save for any tenant whose stored override is not valid. No API path writes
  // the override (the Zod schema rejects it), so it is judged where it is read:
  // ChatbotConfigResolver, through findLlmOverrideProblem() below.
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

  /**
   * Why an operator's LLM override cannot be used, or `null` when it can (M26-S21):
   *  - `provider` + `model`, or `model` alone (the provider then stays the tier's). A provider
   *    alone is invalid: a model slug means something only to its own provider, so nothing says
   *    which model to use.
   *  - The provider must be one an override may name, and `anthropic` / `openai` only with that
   *    adapter's own default model: those adapters price only that model correctly, and the
   *    global daily spend limit sums each message's stored cost.
   */
  static findLlmOverrideProblem(chatbot: ChatbotSettings): string | null {
    const { llmProvider, llmModel } = chatbot;
    if (llmProvider === undefined && llmModel === undefined) return null;
    if (llmModel === undefined) {
      return 'chatbot.llmProvider requires chatbot.llmModel (a provider alone is not allowed)';
    }
    if (llmProvider === undefined) return null;
    const allowedModel = CHATBOT_OVERRIDE_PROVIDER_MODELS.get(llmProvider);
    if (allowedModel === undefined) {
      return `chatbot.llmProvider '${llmProvider}' is not a provider an override may name`;
    }
    if (allowedModel !== null && llmModel !== allowedModel) {
      return `chatbot.llmModel must be '${allowedModel}' for provider '${llmProvider}' (the only model it prices correctly)`;
    }
    return null;
  }
}
