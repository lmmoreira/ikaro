import { PlatformErrorCode } from '@ikaro/types';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';
import { ChatbotSettingsValidator } from './chatbot-settings.validator';

describe('ChatbotSettingsValidator', () => {
  it('does nothing when chatbot is undefined', () => {
    expect(() => ChatbotSettingsValidator.validate(undefined)).not.toThrow();
  });

  it('does nothing when knowledgeText is empty', () => {
    expect(() => ChatbotSettingsValidator.validate({ knowledgeText: '' })).not.toThrow();
  });

  it('accepts a knowledgeText within the default 4000-char limit', () => {
    expect(() =>
      ChatbotSettingsValidator.validate({ knowledgeText: 'a'.repeat(4000) }),
    ).not.toThrow();
  });

  it('throws PLATFORM_SETTINGS_CHATBOT_KNOWLEDGE_TEXT_TOO_LONG for a knowledgeText exceeding the default 4000-char limit', () => {
    try {
      ChatbotSettingsValidator.validate({ knowledgeText: 'a'.repeat(4001) });
      throw new Error('expected ChatbotSettingsValidator.validate to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TenantSettingsValidationError);
      expect((err as TenantSettingsValidationError).code).toBe(
        PlatformErrorCode.SETTINGS_CHATBOT_KNOWLEDGE_TEXT_TOO_LONG,
      );
      expect((err as TenantSettingsValidationError).field).toBe('chatbot.knowledgeText');
    }
  });

  it('resolves the cap against a per-tenant maxKnowledgeTextLength override, allowing content above the default', () => {
    expect(() =>
      ChatbotSettingsValidator.validate({
        knowledgeText: 'a'.repeat(5000),
        maxKnowledgeTextLength: 6000,
      }),
    ).not.toThrow();
  });

  it('resolves the cap against a per-tenant maxKnowledgeTextLength override, rejecting content above it', () => {
    expect(() =>
      ChatbotSettingsValidator.validate({
        knowledgeText: 'a'.repeat(2001),
        maxKnowledgeTextLength: 2000,
      }),
    ).toThrow(TenantSettingsValidationError);
  });
});
