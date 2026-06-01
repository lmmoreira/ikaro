import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailSendOptions, IEmailSender } from '../../application/ports/email-sender.port';

@Injectable()
export class MailhogEmailAdapter implements IEmailSender {
  private readonly transporter: nodemailer.Transporter;

  constructor(config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST', 'localhost'),
      port: config.get<number>('SMTP_PORT', 1025),
      secure: false,
      ignoreTLS: true,
    });
  }

  async send(options: EmailSendOptions): Promise<void> {
    await this.transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
  }
}
