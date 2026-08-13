import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  CHATBOT_MESSAGE_REPOSITORY,
  IChatbotMessageRepository,
} from '../ports/chatbot-message-repository.port';
import {
  CHATBOT_SESSION_REPOSITORY,
  IChatbotSessionRepository,
} from '../ports/chatbot-session-repository.port';

// UC-035: retention window is a hardcoded code constant, not a tenants.settings key.
export const CHATBOT_RETENTION_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ChatbotRetentionPurgeJobResult {
  messagesDeleted: number;
  sessionsDeleted: number;
}

@Injectable()
export class ChatbotRetentionPurgeJob {
  constructor(
    @Inject(CHATBOT_MESSAGE_REPOSITORY) private readonly messageRepo: IChatbotMessageRepository,
    @Inject(CHATBOT_SESSION_REPOSITORY) private readonly sessionRepo: IChatbotSessionRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async run(now: Date = new Date()): Promise<ChatbotRetentionPurgeJobResult> {
    const cutoff = new Date(now.getTime() - CHATBOT_RETENTION_DAYS * MS_PER_DAY);

    return this.txManager.run(async () => {
      const messagesDeleted = await this.messageRepo.deleteOlderThan(cutoff);
      // A single set-based correlated DELETE, not a candidate-list-then-per-row loop — the
      // latter was this story's first draft and was replaced after cross-tool review (PR #365)
      // flagged it as an unbounded N+1 (a candidate read with no supporting index, followed by
      // an existence check + delete per row) and a cross-transaction TOCTOU race (a session
      // could be reserved by a concurrent SendChatMessageUseCase call between the candidate
      // read and the per-row delete). A single statement removes both: it evaluates its own
      // NOT EXISTS subquery server-side, atomically, against the exact row it's deleting, and
      // sees deleteOlderThan()'s own not-yet-committed effect within this same transaction —
      // see TypeOrmChatbotSessionRepository.deleteOrphanedStartedBefore().
      const sessionsDeleted = await this.sessionRepo.deleteOrphanedStartedBefore(cutoff);

      return { messagesDeleted, sessionsDeleted };
    });
  }
}
