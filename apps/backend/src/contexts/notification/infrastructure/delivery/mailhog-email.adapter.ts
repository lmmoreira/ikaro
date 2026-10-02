import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailSendOptions, IEmailSender } from '../../application/ports/email-sender.port';
import { toNodemailerMessage } from './email-message.mapper';

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
    await this.transporter.sendMail(toNodemailerMessage(options));
  }
}
