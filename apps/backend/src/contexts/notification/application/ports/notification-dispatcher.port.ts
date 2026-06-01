import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';

export interface OutboundMessage {
  tenantId: string;
  to: string;
  subject: string;
  templateKey: NotificationTemplateKey;
  data: Record<string, unknown>;
}

export const NOTIFICATION_DISPATCHER = Symbol('INotificationDispatcher');

export interface INotificationDispatcher {
  dispatch(message: OutboundMessage): Promise<void>;
}
