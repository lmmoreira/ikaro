import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { NotificationTemplateKey } from './notification-template-key.enum';

export type NotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

export interface NotificationTemplateProps {
  id: string;
  tenantId: string | null;
  triggerEvent: NotificationTemplateKey;
  channel: NotificationChannel;
  locale: string;
  subject: string;
  body: string;
  updatedAt: Date;
}

export interface RenderedTemplate {
  subject: string;
  body: string;
}

export class NotificationTemplate {
  readonly id: string;
  readonly tenantId: string | null;
  readonly triggerEvent: NotificationTemplateKey;
  readonly channel: NotificationChannel;
  readonly locale: string;
  private _subject: string;
  private _body: string;
  readonly updatedAt: Date;

  private constructor(props: NotificationTemplateProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.triggerEvent = props.triggerEvent;
    this.channel = props.channel;
    this.locale = props.locale;
    this._subject = props.subject;
    this._body = props.body;
    this.updatedAt = props.updatedAt;
  }

  get subject(): string {
    return this._subject;
  }

  get body(): string {
    return this._body;
  }

  static create(props: Omit<NotificationTemplateProps, 'id' | 'updatedAt'>): NotificationTemplate {
    if (!props.locale.trim()) throw new Error('NotificationTemplate locale must be non-empty');
    if (!props.subject.trim()) throw new Error('NotificationTemplate subject must be non-empty');
    if (!props.body.trim()) throw new Error('NotificationTemplate body must be non-empty');
    return new NotificationTemplate({ ...props, id: uuidv7(), updatedAt: new Date() });
  }

  static reconstitute(props: NotificationTemplateProps): NotificationTemplate {
    return new NotificationTemplate(props);
  }

  update(subject: string, body: string): void {
    if (!subject.trim()) throw new Error('NotificationTemplate subject must be non-empty');
    if (!body.trim()) throw new Error('NotificationTemplate body must be non-empty');
    this._subject = subject;
    this._body = body;
  }

  render(variables: Record<string, string>): RenderedTemplate {
    const interpolate = (template: string): string =>
      template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '');
    return {
      subject: interpolate(this._subject),
      body: interpolate(this._body),
    };
  }
}
