export interface EmailSendOptions {
  to: string;
  from: string;
  subject: string;
  html: string;
}

export const EMAIL_SENDER = Symbol('IEmailSender');

export interface IEmailSender {
  send(options: EmailSendOptions): Promise<void>;
}
