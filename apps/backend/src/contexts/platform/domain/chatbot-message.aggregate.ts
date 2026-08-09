import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export type ChatbotMessageRole = 'USER' | 'ASSISTANT';

export interface ChatbotMessageProps {
  id: string;
  sessionId: string;
  tenantId: string;
  role: ChatbotMessageRole;
  content: string;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
  createdAt: Date;
}

type CreateInput = Omit<ChatbotMessageProps, 'id' | 'createdAt'>;

export class ChatbotMessage extends AggregateRoot {
  readonly id: string;
  readonly sessionId: string;
  readonly tenantId: string;
  readonly role: ChatbotMessageRole;
  readonly content: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly modelId: string;
  readonly createdAt: Date;

  private constructor(props: ChatbotMessageProps) {
    super();
    this.id = props.id;
    this.sessionId = props.sessionId;
    this.tenantId = props.tenantId;
    this.role = props.role;
    this.content = props.content;
    this.inputTokens = props.inputTokens;
    this.outputTokens = props.outputTokens;
    this.modelId = props.modelId;
    this.createdAt = props.createdAt;
  }

  static create(props: CreateInput): ChatbotMessage {
    return new ChatbotMessage({
      ...props,
      id: uuidv7(),
      createdAt: new Date(),
    });
  }

  static reconstitute(props: ChatbotMessageProps): ChatbotMessage {
    return new ChatbotMessage(props);
  }
}
