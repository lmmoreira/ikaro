import { Decimal } from 'decimal.js';
import { ChatbotProviderBalance } from './chatbot-provider-balance.aggregate';

describe('ChatbotProviderBalance', () => {
  describe('upsert()', () => {
    it('produces a balance row with the given provider and amount, health fields unset', () => {
      const balance = ChatbotProviderBalance.upsert('openrouter', 18.42);

      expect(balance.provider).toBe('openrouter');
      expect(balance.remainingUsd).toBeInstanceOf(Decimal);
      expect(balance.remainingUsd!.toNumber()).toBe(18.42);
      expect(balance.checkedAt).toBeInstanceOf(Date);
      expect(balance.lastSuccessAt).toBeNull();
      expect(balance.lastFailureAt).toBeNull();
    });

    it('replaces the value on a subsequent call — no history kept in the domain object itself', () => {
      const first = ChatbotProviderBalance.upsert('openrouter', 18.42);
      const second = ChatbotProviderBalance.upsert('openrouter', 15.0);

      expect(first.remainingUsd!.toNumber()).toBe(18.42);
      expect(second.remainingUsd!.toNumber()).toBe(15.0);
      expect(second.checkedAt!.getTime()).toBeGreaterThanOrEqual(first.checkedAt!.getTime());
    });

    it('accepts a string or Decimal input without losing precision', () => {
      const fromString = ChatbotProviderBalance.upsert('openrouter', '18.4234');
      const fromDecimal = ChatbotProviderBalance.upsert('openrouter', new Decimal('18.4234'));

      expect(fromString.remainingUsd!.toString()).toBe('18.4234');
      expect(fromDecimal.remainingUsd!.toString()).toBe('18.4234');
    });
  });

  describe('reconstitute()', () => {
    it('restores all props without re-validating', () => {
      const checkedAt = new Date('2026-08-09T10:00:00Z');
      const lastSuccessAt = new Date('2026-08-09T11:00:00Z');

      const balance = ChatbotProviderBalance.reconstitute({
        provider: 'openrouter',
        remainingUsd: new Decimal(5.5),
        checkedAt,
        lastSuccessAt,
        lastFailureAt: null,
      });

      expect(balance.provider).toBe('openrouter');
      expect(balance.remainingUsd!.toNumber()).toBe(5.5);
      expect(balance.checkedAt).toBe(checkedAt);
      expect(balance.lastSuccessAt).toBe(lastSuccessAt);
      expect(balance.lastFailureAt).toBeNull();
    });

    it('restores a health-only row — remainingUsd/checkedAt null, never polled for this provider', () => {
      const balance = ChatbotProviderBalance.reconstitute({
        provider: 'anthropic',
        remainingUsd: null,
        checkedAt: null,
        lastSuccessAt: new Date(),
        lastFailureAt: null,
      });

      expect(balance.remainingUsd).toBeNull();
      expect(balance.checkedAt).toBeNull();
    });
  });

  // UC-034 condition (c) — see the method's own docstring for the full half-open/cooldown
  // rationale (a plain "most recent event wins" rule would permanently lock the widget dark,
  // since a hidden widget can never produce the success needed to clear it).
  describe('isHealthy()', () => {
    const NOW = new Date('2026-08-12T12:00:00Z');
    const COOLDOWN_MINUTES = 5;

    it('is healthy when no failure has ever been recorded', () => {
      const balance = ChatbotProviderBalance.reconstitute({
        provider: 'openrouter',
        remainingUsd: null,
        checkedAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
      });

      expect(balance.isHealthy(COOLDOWN_MINUTES, NOW)).toBe(true);
    });

    it('is healthy when the most recent event is a success', () => {
      const balance = ChatbotProviderBalance.reconstitute({
        provider: 'openrouter',
        remainingUsd: null,
        checkedAt: null,
        lastSuccessAt: new Date('2026-08-12T11:59:00Z'),
        lastFailureAt: new Date('2026-08-12T11:00:00Z'),
      });

      expect(balance.isHealthy(COOLDOWN_MINUTES, NOW)).toBe(true);
    });

    it('is unhealthy when the most recent event is a failure within the cooldown window', () => {
      const balance = ChatbotProviderBalance.reconstitute({
        provider: 'openrouter',
        remainingUsd: null,
        checkedAt: null,
        lastSuccessAt: new Date('2026-08-12T11:00:00Z'),
        lastFailureAt: new Date('2026-08-12T11:57:00Z'), // 3 min before NOW, cooldown = 5 min
      });

      expect(balance.isHealthy(COOLDOWN_MINUTES, NOW)).toBe(false);
    });

    it('is healthy again once the cooldown has elapsed since the most recent failure (half-open retry)', () => {
      const balance = ChatbotProviderBalance.reconstitute({
        provider: 'openrouter',
        remainingUsd: null,
        checkedAt: null,
        lastSuccessAt: null,
        lastFailureAt: new Date('2026-08-12T11:54:00Z'), // 6 min before NOW, cooldown = 5 min
      });

      expect(balance.isHealthy(COOLDOWN_MINUTES, NOW)).toBe(true);
    });

    it('is unhealthy exactly at the cooldown boundary minus one second', () => {
      const balance = ChatbotProviderBalance.reconstitute({
        provider: 'openrouter',
        remainingUsd: null,
        checkedAt: null,
        lastSuccessAt: null,
        lastFailureAt: new Date(NOW.getTime() - COOLDOWN_MINUTES * 60 * 1000 + 1000),
      });

      expect(balance.isHealthy(COOLDOWN_MINUTES, NOW)).toBe(false);
    });

    it('is healthy exactly at the cooldown boundary', () => {
      const balance = ChatbotProviderBalance.reconstitute({
        provider: 'openrouter',
        remainingUsd: null,
        checkedAt: null,
        lastSuccessAt: null,
        lastFailureAt: new Date(NOW.getTime() - COOLDOWN_MINUTES * 60 * 1000),
      });

      expect(balance.isHealthy(COOLDOWN_MINUTES, NOW)).toBe(true);
    });

    it('defaults `now` to the current time when not passed explicitly', () => {
      const balance = ChatbotProviderBalance.reconstitute({
        provider: 'openrouter',
        remainingUsd: null,
        checkedAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
      });

      expect(balance.isHealthy(COOLDOWN_MINUTES)).toBe(true);
    });
  });
});
