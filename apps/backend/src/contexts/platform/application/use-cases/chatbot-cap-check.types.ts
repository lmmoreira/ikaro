import { AppLogger } from '../../../../shared/observability/app-logger';
import { IApplicationConfig } from '../../../../shared/ports/application-config.port';
import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { ITracingPort } from '@ikaro/observability';
import { ChatbotSession } from '../../domain/chatbot-session.aggregate';
import { IChatbotMessageRepository } from '../ports/chatbot-message-repository.port';
import { IChatbotProviderBalanceRepository } from '../ports/chatbot-provider-balance-repository.port';
import { IChatbotSessionRepository } from '../ports/chatbot-session-repository.port';
import { ChatTurn } from '../ports/llm-provider.port';

export interface ResolvedSession {
  session: ChatbotSession;
  history: ChatTurn[];
}

export interface ChatbotCapCheckDeps {
  sessionRepo: IChatbotSessionRepository;
  messageRepo: IChatbotMessageRepository;
  balanceRepo: IChatbotProviderBalanceRepository;
  txManager: ITransactionManager;
  config: IApplicationConfig;
  tracingPort: ITracingPort;
  logger: AppLogger;
}
