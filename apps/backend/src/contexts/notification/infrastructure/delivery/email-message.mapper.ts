import type { SendMailOptions } from 'nodemailer';
import { EmailSendOptions } from '../../application/ports/email-sender.port';

// The tenant name is passed as a structured `{ name, address }` From — never concatenated into a
// `"Name" <addr>` string — so nodemailer encodes/sanitizes it and a tenant-controlled name
// containing quotes or CRLF cannot inject headers.
export function toNodemailerMessage(options: EmailSendOptions): SendMailOptions {
  return {
    to: options.to,
    from: options.fromName ? { name: options.fromName, address: options.from } : options.from,
    replyTo: options.replyTo,
    subject: options.subject,
    html: options.html,
  };
}
