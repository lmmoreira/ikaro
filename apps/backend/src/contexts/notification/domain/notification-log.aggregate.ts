import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { Email } from '../../../shared/value-objects/email.vo';

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface NotificationLogProps {
  id: string;
  tenantId: string;
  eventId: string;
  notificationType: string;
  channel: string;
  recipientEmail: Email;
  status: NotificationStatus;
  retryCount: number;
  errorMessage?: string;
  sentAt?: Date;
  createdAt: Date;
}

type CreateInput = Omit<NotificationLogProps, 'id' | 'createdAt' | 'status' | 'retryCount' | 'recipientEmail'> & {
  recipientEmail: string;
};

type ReconstituteInput = Omit<NotificationLogProps, 'recipientEmail'> & {
  recipientEmail: string;
};

export class NotificationLog extends AggregateRoot {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly notificationType: string;
  readonly channel: string;
  readonly recipientEmail: Email;
  private _status: NotificationStatus;
  private _retryCount: number;
  private _errorMessage?: string;
  private _sentAt?: Date;
  readonly createdAt: Date;

  private constructor(props: NotificationLogProps) {
    super();
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.eventId = props.eventId;
    this.notificationType = props.notificationType;
    this.channel = props.channel;
    this.recipientEmail = props.recipientEmail;
    this._status = props.status;
    this._retryCount = props.retryCount;
    this._errorMessage = props.errorMessage;
    this._sentAt = props.sentAt;
    this.createdAt = props.createdAt;
  }

  get status(): NotificationStatus {
    return this._status;
  }

  get retryCount(): number {
    return this._retryCount;
  }

  get errorMessage(): string | undefined {
    return this._errorMessage;
  }

  get sentAt(): Date | undefined {
    return this._sentAt;
  }

  static create(props: CreateInput): NotificationLog {
    return new NotificationLog({
      ...props,
      recipientEmail: Email.create(props.recipientEmail),
      id: uuidv7(),
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: ReconstituteInput): NotificationLog {
    return new NotificationLog({
      ...props,
      recipientEmail: Email.create(props.recipientEmail),
    });
  }

  markSent(): void {
    this._status = 'SENT';
    this._sentAt = new Date();
  }

  markFailed(errorMessage: string): void {
    this._status = 'FAILED';
    this._retryCount += 1;
    this._errorMessage = errorMessage;
  }
}
