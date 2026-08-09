import { ChatbotProviderBalance } from './chatbot-provider-balance.aggregate';

describe('ChatbotProviderBalance', () => {
  describe('upsert()', () => {
    it('produces a balance row with the given provider and amount', () => {
      const balance = ChatbotProviderBalance.upsert('openrouter', 18.42);

      expect(balance.provider).toBe('openrouter');
      expect(balance.remainingUsd).toBe(18.42);
      expect(balance.checkedAt).toBeInstanceOf(Date);
    });

    it('replaces the value on a subsequent call — no history kept in the domain object itself', () => {
      const first = ChatbotProviderBalance.upsert('openrouter', 18.42);
      const second = ChatbotProviderBalance.upsert('openrouter', 15.0);

      expect(first.remainingUsd).toBe(18.42);
      expect(second.remainingUsd).toBe(15.0);
      expect(second.checkedAt.getTime()).toBeGreaterThanOrEqual(first.checkedAt.getTime());
    });
  });

  describe('reconstitute()', () => {
    it('restores all props without re-validating', () => {
      const checkedAt = new Date('2026-08-09T10:00:00Z');

      const balance = ChatbotProviderBalance.reconstitute({
        provider: 'openrouter',
        remainingUsd: 5.5,
        checkedAt,
      });

      expect(balance.provider).toBe('openrouter');
      expect(balance.remainingUsd).toBe(5.5);
      expect(balance.checkedAt).toBe(checkedAt);
    });
  });
});
