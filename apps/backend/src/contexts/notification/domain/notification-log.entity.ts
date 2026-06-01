import { uuidv7 } from '../../../shared/domain/uuid-v7';

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface NotificationLogProps {
  id: string;
  tenantId: string;
  eventId: string;
  notificationType: string;
  channel: string;
  recipientEmail: string;
  status: NotificationStatus;
  retryCount: number;
  errorMessage?: string;
  sentAt?: Date;
  createdAt: Date;
}

export class NotificationLog {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly notificationType: string;
  readonly channel: string;
  readonly recipientEmail: string;
  private _status: NotificationStatus;
  private _retryCount: number;
  private _errorMessage?: string;
  private _sentAt?: Date;
  readonly createdAt: Date;

  private constructor(props: NotificationLogProps) {
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

  static create(
    props: Omit<NotificationLogProps, 'id' | 'createdAt' | 'status' | 'retryCount'>,
  ): NotificationLog {
    return new NotificationLog({
      ...props,
      id: uuidv7(),
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: NotificationLogProps): NotificationLog {
    return new NotificationLog(props);
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
