import { Decimal } from 'decimal.js';
import { ChatbotProviderBalance } from './chatbot-provider-balance.aggregate';

describe('ChatbotProviderBalance', () => {
  describe('upsert()', () => {
    it('produces a balance row with the given provider and amount', () => {
      const balance = ChatbotProviderBalance.upsert('openrouter', 18.42);

      expect(balance.provider).toBe('openrouter');
      expect(balance.remainingUsd).toBeInstanceOf(Decimal);
      expect(balance.remainingUsd.toNumber()).toBe(18.42);
      expect(balance.checkedAt).toBeInstanceOf(Date);
    });

    it('replaces the value on a subsequent call — no history kept in the domain object itself', () => {
      const first = ChatbotProviderBalance.upsert('openrouter', 18.42);
      const second = ChatbotProviderBalance.upsert('openrouter', 15.0);

      expect(first.remainingUsd.toNumber()).toBe(18.42);
      expect(second.remainingUsd.toNumber()).toBe(15.0);
      expect(second.checkedAt.getTime()).toBeGreaterThanOrEqual(first.checkedAt.getTime());
    });

    it('accepts a string or Decimal input without losing precision', () => {
      const fromString = ChatbotProviderBalance.upsert('openrouter', '18.4234');
      const fromDecimal = ChatbotProviderBalance.upsert('openrouter', new Decimal('18.4234'));

      expect(fromString.remainingUsd.toString()).toBe('18.4234');
      expect(fromDecimal.remainingUsd.toString()).toBe('18.4234');
    });
  });

  describe('reconstitute()', () => {
    it('restores all props without re-validating', () => {
      const checkedAt = new Date('2026-08-09T10:00:00Z');

      const balance = ChatbotProviderBalance.reconstitute({
        provider: 'openrouter',
        remainingUsd: new Decimal(5.5),
        checkedAt,
      });

      expect(balance.provider).toBe('openrouter');
      expect(balance.remainingUsd.toNumber()).toBe(5.5);
      expect(balance.checkedAt).toBe(checkedAt);
    });
  });
});
