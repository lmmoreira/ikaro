import { ChatbotMessage } from './chatbot-message.aggregate';

const BASE_PROPS = {
  tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
  sessionId: 'bbbbbbbb-0000-4000-8000-000000000001',
  role: 'USER' as const,
  content: 'Quais são os horários de funcionamento?',
  inputTokens: 12,
  outputTokens: 0,
  modelId: 'deepseek/deepseek-v4-flash-0731',
};

describe('ChatbotMessage', () => {
  describe('create()', () => {
    it('creates a message row with a generated id and createdAt', () => {
      const message = ChatbotMessage.create(BASE_PROPS);

      expect(message.id).toBeDefined();
      expect(message.tenantId).toBe(BASE_PROPS.tenantId);
      expect(message.sessionId).toBe(BASE_PROPS.sessionId);
      expect(message.role).toBe('USER');
      expect(message.content).toBe(BASE_PROPS.content);
      expect(message.inputTokens).toBe(BASE_PROPS.inputTokens);
      expect(message.outputTokens).toBe(BASE_PROPS.outputTokens);
      expect(message.modelId).toBe(BASE_PROPS.modelId);
      expect(message.createdAt).toBeInstanceOf(Date);
    });

    it('creates an ASSISTANT reply message', () => {
      const message = ChatbotMessage.create({
        ...BASE_PROPS,
        role: 'ASSISTANT',
        content: 'Funcionamos de segunda a sábado, das 8h às 18h.',
        inputTokens: 120,
        outputTokens: 35,
      });

      expect(message.role).toBe('ASSISTANT');
      expect(message.outputTokens).toBe(35);
    });
  });

  describe('reconstitute()', () => {
    it('restores all props without re-validating', () => {
      const createdAt = new Date('2026-08-09T10:00:00Z');

      const message = ChatbotMessage.reconstitute({
        id: 'some-id',
        ...BASE_PROPS,
        createdAt,
      });

      expect(message.id).toBe('some-id');
      expect(message.createdAt).toBe(createdAt);
    });
  });
});
