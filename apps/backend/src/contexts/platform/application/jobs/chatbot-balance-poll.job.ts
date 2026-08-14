import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { OpenRouterCreditsClient } from '../../infrastructure/llm/openrouter-credits.client';
import { OPENROUTER_PROVIDER_NAME } from '../ports/llm-provider.port';
import {
  CHATBOT_PROVIDER_BALANCE_REPOSITORY,
  IChatbotProviderBalanceRepository,
} from '../ports/chatbot-provider-balance-repository.port';
import { ChatbotProviderBalance } from '../../domain/chatbot-provider-balance.aggregate';

export interface ChatbotBalancePollJobResult {
  polled: boolean;
}

@Injectable()
export class ChatbotBalancePollJob {
  private readonly logger = new AppLogger(ChatbotBalancePollJob.name);

  constructor(
    private readonly creditsClient: OpenRouterCreditsClient,
    @Inject(CHATBOT_PROVIDER_BALANCE_REPOSITORY)
    private readonly balanceRepo: IChatbotProviderBalanceRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  // UC-036: the credits call is cross-service network I/O (PR #267 precedent) — it must run
  // outside txManager.run(), never inside or as a post-commit step. On failure, this logs a
  // warning and leaves the existing chatbot_provider_balance row unchanged rather than
  // throwing — a stale reading in either direction is safe at this cost scale (CHATBOT.md
  // §8.10), and this job's own trigger handler would otherwise nack/retry forever against an
  // account API that's genuinely down.
  async run(): Promise<ChatbotBalancePollJobResult> {
    let remainingUsd;
    try {
      remainingUsd = await this.creditsClient.getRemainingBalanceUsd();
    } catch (err) {
      this.logger.warn('OpenRouter credits poll failed — leaving existing balance row unchanged', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { polled: false };
    }

    const balance = ChatbotProviderBalance.upsert(OPENROUTER_PROVIDER_NAME, remainingUsd);
    await this.txManager.run(async () => {
      await this.balanceRepo.saveBalance(balance);
    });

    return { polled: true };
  }
}
