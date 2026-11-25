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
  describe('operator LLM override (M26-S21): findLlmOverrideProblem', () => {
    const problem = (
      chatbot: Parameters<typeof ChatbotSettingsValidator.findLlmOverrideProblem>[0],
    ) => ChatbotSettingsValidator.findLlmOverrideProblem(chatbot);

    it('finds no problem with no override, and with a model alone (the provider stays the tier’s)', () => {
      expect(problem({ knowledgeText: 'x' })).toBeNull();
      expect(problem({ llmModel: 'google/gemini-test' })).toBeNull();
    });

    it('treats a stored JSON null like an absent key', () => {
      expect(problem({ llmProvider: null, llmModel: 'google/gemini-test' } as never)).toBeNull();
      expect(problem({ llmProvider: null, llmModel: null } as never)).toBeNull();
      expect(problem({ llmProvider: 'anthropic', llmModel: null } as never)).toContain(
        'requires chatbot.llmModel',
      );
    });

    it('reports a provider alone: nothing says which model to use', () => {
      expect(problem({ llmProvider: 'openrouter' })).toContain('requires chatbot.llmModel');
      expect(problem({ llmProvider: 'anthropic' })).toContain('requires chatbot.llmModel');
    });

    it('accepts openrouter with any model', () => {
      expect(
        problem({ llmProvider: 'openrouter', llmModel: 'anthropic/claude-sonnet-5' }),
      ).toBeNull();
    });

    it('accepts anthropic and openai only with that adapter’s own default model (the only one it prices correctly)', () => {
      expect(problem({ llmProvider: 'anthropic', llmModel: 'claude-haiku-4-5' })).toBeNull();
      expect(problem({ llmProvider: 'openai', llmModel: 'gpt-5.6-luna' })).toBeNull();
      expect(problem({ llmProvider: 'anthropic', llmModel: 'claude-sonnet-5' })).toContain(
        "must be 'claude-haiku-4-5'",
      );
      expect(problem({ llmProvider: 'openai', llmModel: 'gpt-other' })).toContain(
        "must be 'gpt-5.6-luna'",
      );
    });

    it('reports a provider an override may not name: fake (selected only by CHATBOT_LLM_FAKE), unknown names, prototype keys', () => {
      expect(problem({ llmProvider: 'fake', llmModel: 'fake-llm-e2e' })).toContain(
        'not a provider',
      );
      expect(problem({ llmProvider: 'vertex-ai', llmModel: 'x' })).toContain('not a provider');
      expect(problem({ llmProvider: 'constructor', llmModel: 'x' })).toContain('not a provider');
    });

    it('is not part of validate(): a stored override never fails TenantSettings.create(), so an unrelated settings PATCH is never blocked by it', () => {
      expect(() => ChatbotSettingsValidator.validate({ llmProvider: 'anthropic' })).not.toThrow();
      expect(() =>
        ChatbotSettingsValidator.validate({
          llmProvider: 'anthropic',
          llmModel: 'claude-sonnet-5',
          knowledgeText: 'x',
        }),
      ).not.toThrow();
    });
  });
});
