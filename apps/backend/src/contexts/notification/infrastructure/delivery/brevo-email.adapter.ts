import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailDeliveryException } from '../../domain/errors/notification-domain.error';
import { EmailSendOptions, IEmailSender } from '../../application/ports/email-sender.port';

@Injectable()
export class BrevoEmailAdapter implements IEmailSender {
  private readonly transporter: nodemailer.Transporter;

  constructor(config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: config.get<string>('BREVO_SMTP_LOGIN', ''),
        pass: config.get<string>('BREVO_SMTP_KEY', ''),
      },
    });
  }

  async send(options: EmailSendOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
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
