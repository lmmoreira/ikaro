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
      host: config.get<string>('BREVO_SMTP_HOST', 'smtp-relay.brevo.com'),
      // Defaults to implicit TLS (port 465, secure: true) — not STARTTLS on 587 —
      // so the connection is encrypted from the start; Brevo supports both
      // (SonarCloud S5332 flags secure: false as unverifiable cleartext).
      port: config.get<number>('BREVO_SMTP_PORT', 465),
      secure: config.get<boolean>('BREVO_SMTP_SECURE', true),
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
