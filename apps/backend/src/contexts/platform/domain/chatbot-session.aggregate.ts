import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export type ChatbotSessionStatus = 'ACTIVE' | 'CLOSED' | 'CAPPED';

export interface ChatbotSessionProps {
  id: string;
  tenantId: string;
  clientIp: string;
  startedAt: Date;
  lastMessageAt: Date;
  conversationDate: string;
  messageCount: number;
  status: ChatbotSessionStatus;
}

type CreateInput = Pick<ChatbotSessionProps, 'tenantId' | 'clientIp' | 'conversationDate'>;

export class ChatbotSession extends AggregateRoot {
  readonly id: string;
  readonly tenantId: string;
  readonly clientIp: string;
  readonly startedAt: Date;
  readonly conversationDate: string;
  private _lastMessageAt: Date;
  private _messageCount: number;
  private _status: ChatbotSessionStatus;

  private constructor(props: ChatbotSessionProps) {
    super();
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.clientIp = props.clientIp;
    this.startedAt = props.startedAt;
    this.conversationDate = props.conversationDate;
    this._lastMessageAt = props.lastMessageAt;
    this._messageCount = props.messageCount;
    this._status = props.status;
  }

  get lastMessageAt(): Date {
    return this._lastMessageAt;
  }

  get messageCount(): number {
    return this._messageCount;
  }

  get status(): ChatbotSessionStatus {
    return this._status;
  }

  static create(props: CreateInput): ChatbotSession {
    const now = new Date();
    return new ChatbotSession({
      ...props,
      id: uuidv7(),
      startedAt: now,
      lastMessageAt: now,
      messageCount: 0,
      status: 'ACTIVE',
    });
  }

  static reconstitute(props: ChatbotSessionProps): ChatbotSession {
    return new ChatbotSession(props);
  }

  recordMessage(): void {
    this._messageCount += 1;
    this._lastMessageAt = new Date();
  }

  markCapped(): void {
    this._status = 'CAPPED';
  }

  close(): void {
    this._status = 'CLOSED';
  }
}
