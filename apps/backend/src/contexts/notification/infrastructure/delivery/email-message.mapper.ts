import type { SendMailOptions } from 'nodemailer';
import { EmailSendOptions } from '../../application/ports/email-sender.port';
import { escapeHtml } from '../../../../shared/utils/escape-html';
import { htmlToText } from './html-to-text';

// A bare fragment has no charset or language; clients then guess both. The wrapper states them,
// and the text part is derived from the same body so the two alternatives never disagree.
function toHtmlDocument(body: string, lang: string | undefined): string {
  const htmlLang = lang ? ` lang="${escapeHtml(lang)}"` : '';
  return `<!doctype html><html${htmlLang}><head><meta charset="utf-8"></head><body>${body}</body></html>`;
}

// The tenant name is passed as a structured `{ name, address }` From — never concatenated into a
// `"Name" <addr>` string — so nodemailer encodes/sanitizes it and a tenant-controlled name
// containing quotes or CRLF cannot inject headers.
export function toNodemailerMessage(options: EmailSendOptions): SendMailOptions {
  return {
    to: options.to,
    from: options.fromName ? { name: options.fromName, address: options.from } : options.from,
    replyTo: options.replyTo,
    subject: options.subject,
    html: toHtmlDocument(options.html, options.lang),
    text: htmlToText(options.html),
  };
}
