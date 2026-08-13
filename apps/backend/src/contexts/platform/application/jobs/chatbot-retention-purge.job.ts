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

      // A session's message_count column is never decremented when its old messages are
      // purged above, so "now-orphaned" is decided by re-checking the live chatbot_messages
      // table per candidate, not by trusting that stale counter — never deletes a session
      // that still has messages (UC-035 main flow step 2). existsForSession() (not
      // findBySession()) is deliberately transaction-aware so this check sees the delete
      // above's own not-yet-committed effect within this same transaction.
      const candidates = await this.sessionRepo.findStartedBefore(cutoff);
      let sessionsDeleted = 0;
      for (const session of candidates) {
        const stillHasMessages = await this.messageRepo.existsForSession(
          session.id,
          session.tenantId,
        );
        if (!stillHasMessages) {
          await this.sessionRepo.deleteById(session.id, session.tenantId);
          sessionsDeleted++;
        }
      }

      return { messagesDeleted, sessionsDeleted };
    });
  }
}
