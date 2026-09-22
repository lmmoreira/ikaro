import {
  EmailSendOptions,
  IEmailSender,
} from '../../contexts/notification/application/ports/email-sender.port';

export class InMemoryEmailSender implements IEmailSender {
  readonly sent: EmailSendOptions[] = [];

  async send(options: EmailSendOptions): Promise<void> {
    this.sent.push(options);
  }
}
