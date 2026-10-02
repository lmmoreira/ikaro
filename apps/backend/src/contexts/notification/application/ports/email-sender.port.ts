export interface EmailSendOptions {
  to: string;
  /** Bare sender address (the platform's authenticated EMAIL_FROM). */
  from: string;
  /** Display name for the From header; passed structurally so the transport sanitizes it. */
  fromName?: string;
  replyTo?: string;
  subject: string;
  html: string;
}

export const EMAIL_SENDER = Symbol('IEmailSender');

export interface IEmailSender {
  send(options: EmailSendOptions): Promise<void>;
}
