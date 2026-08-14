import { Decimal } from 'decimal.js';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryChatbotProviderBalanceRepository } from '../../../../test/repositories/platform/in-memory-chatbot-provider-balance.repository';
import { ChatbotProviderBalance } from '../../domain/chatbot-provider-balance.aggregate';
import { OpenRouterCreditsClient } from '../../infrastructure/llm/openrouter-credits.client';
import { ChatbotBalancePollJob } from './chatbot-balance-poll.job';

describe('ChatbotBalancePollJob', () => {
  let creditsClient: jest.Mocked<OpenRouterCreditsClient>;
  let balanceRepo: InMemoryChatbotProviderBalanceRepository;
  let txManager: InMemoryTransactionManager;
  let job: ChatbotBalancePollJob;

  beforeEach(() => {
    creditsClient = {
      getRemainingBalanceUsd: jest.fn(),
    } as unknown as jest.Mocked<OpenRouterCreditsClient>;
    balanceRepo = new InMemoryChatbotProviderBalanceRepository();
    txManager = new InMemoryTransactionManager();
    job = new ChatbotBalancePollJob(creditsClient, balanceRepo, txManager);
  });

  it('upserts the openrouter balance row with the credits API result', async () => {
    creditsClient.getRemainingBalanceUsd.mockResolvedValue(new Decimal('18.42'));

    const result = await job.run();

    expect(result).toEqual({ polled: true });
    const stored = await balanceRepo.findByProvider('openrouter');
    expect(stored!.remainingUsd!.toNumber()).toBe(18.42);
    expect(stored!.checkedAt).not.toBeNull();
  });

  it('never touches last_success_at/last_failure_at written by a prior health-signal call', async () => {
    const lastSuccessAt = new Date('2026-08-14T10:00:00.000Z');
    await balanceRepo.recordCallOutcome('openrouter', 'SUCCESS', lastSuccessAt);
    creditsClient.getRemainingBalanceUsd.mockResolvedValue(new Decimal('9.99'));

    await job.run();

    const stored = await balanceRepo.findByProvider('openrouter');
    expect(stored!.remainingUsd!.toNumber()).toBe(9.99);
    expect(stored!.lastSuccessAt).toEqual(lastSuccessAt);
    expect(stored!.lastFailureAt).toBeNull();
  });

  it('logs a warning and leaves the existing row unchanged when the credits API call fails', async () => {
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    await balanceRepo.saveBalance(ChatbotProviderBalance.upsert('openrouter', new Decimal('5')));
    creditsClient.getRemainingBalanceUsd.mockRejectedValue(
      new Error('OpenRouter credits request failed: 503'),
    );

    const result = await job.run();

    expect(result).toEqual({ polled: false });
    const stored = await balanceRepo.findByProvider('openrouter');
    expect(stored!.remainingUsd!.toNumber()).toBe(5);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('OpenRouter credits poll failed'),
      expect.objectContaining({ error: 'OpenRouter credits request failed: 503' }),
    );
  });

  it('never throws when the credits API call fails, and still logs the warning', async () => {
    const warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    creditsClient.getRemainingBalanceUsd.mockRejectedValue(new Error('timeout'));

    await expect(job.run()).resolves.toEqual({ polled: false });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('OpenRouter credits poll failed'),
      expect.objectContaining({ error: 'timeout' }),
    );
  });

  it('writes the balance inside a transaction', async () => {
    creditsClient.getRemainingBalanceUsd.mockResolvedValue(new Decimal('12.1'));
    const spy = jest.spyOn(txManager, 'run');

    await job.run();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
