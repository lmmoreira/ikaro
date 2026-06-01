import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';
import { EmailDeliveryException } from '../../domain/errors/notification-domain.error';
import { EmailSendOptions, IEmailSender } from '../../application/ports/email-sender.port';

@Injectable()
export class SendGridEmailAdapter implements IEmailSender, OnModuleInit {
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('SENDGRID_API_KEY', '');
  }

  onModuleInit(): void {
    if (this.apiKey) {
      sgMail.setApiKey(this.apiKey);
    }
  }

  async send(options: EmailSendOptions): Promise<void> {
    try {
      await sgMail.send({
        to: options.to,
        from: options.from,
        subject: options.subject,
        html: options.html,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      throw new EmailDeliveryException(message);
    }
  }
}
