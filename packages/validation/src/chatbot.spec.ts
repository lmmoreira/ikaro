import { ChatbotMessageFieldsSchema } from './chatbot';

describe('ChatbotMessageFieldsSchema', () => {
  it('accepts a message with no sessionId (first message of a conversation)', () => {
    expect(ChatbotMessageFieldsSchema.safeParse({ message: 'Oi' }).success).toBe(true);
  });

  it('accepts a message with a sessionId (existing conversation)', () => {
    const result = ChatbotMessageFieldsSchema.safeParse({
      sessionId: '01234567-0000-7000-8000-000000000101',
      message: 'Oi de novo',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty message', () => {
    expect(ChatbotMessageFieldsSchema.safeParse({ message: '' }).success).toBe(false);
  });

  it('rejects a message over 5000 characters', () => {
    expect(ChatbotMessageFieldsSchema.safeParse({ message: 'x'.repeat(5001) }).success).toBe(false);
  });

  it('rejects a non-uuid sessionId', () => {
    const result = ChatbotMessageFieldsSchema.safeParse({ sessionId: 'not-a-uuid', message: 'Oi' });
    expect(result.success).toBe(false);
  });
});
