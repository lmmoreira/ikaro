export const EMAIL_SENDER = Symbol('IEmailSender');

export interface IEmailSender {
  send(to: string, template: string, data: Record<string, unknown>): Promise<void>;
}
