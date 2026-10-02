import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { BrevoEmailAdapter } from './brevo-email.adapter';
import { MailhogEmailAdapter } from './mailhog-email.adapter';
import { EmailSendOptions } from '../../application/ports/email-sender.port';

// Unlike the adapter specs, this one deliberately does NOT mock nodemailer's message
// composition: createTransport is redirected to nodemailer's real streamTransport so the raw
// RFC 5322 message is actually built, proving a tenant-controlled display name cannot inject
// headers. A mocked transporter could only show we pass a structured object, not that
// nodemailer sanitizes it.
jest.mock('nodemailer', () => {
  const actual = jest.requireActual('nodemailer');
  return {
    ...actual,
    createTransport: () => actual.createTransport({ streamTransport: true, buffer: true }),
  };
});

const config = {
  get: (_key: string, defaultValue?: unknown) => defaultValue,
} as unknown as ConfigService;

const HOSTILE_NAME = 'Evil "Wash"\r\nBcc: attacker@evil.example\r\nX-Injected: 1';

const options: EmailSendOptions = {
  to: 'joao@example.com',
  from: 'noreply@ikaro.example',
  fromName: HOSTILE_NAME,
  replyTo: 'contato@lavacar.example',
  subject: 'Teste',
  html: '<p>Olá</p>',
};

async function captureRawMessage(
  adapter: BrevoEmailAdapter | MailhogEmailAdapter,
): Promise<string> {
  const transporter = (adapter as unknown as { transporter: nodemailer.Transporter }).transporter;
  const spy = jest.spyOn(transporter, 'sendMail');
  await adapter.send(options);
  const info = (await spy.mock.results[0].value) as { message: Buffer };
  return info.message.toString('utf8');
}

function headerNames(raw: string): string[] {
  const headerBlock = raw.split(/\r?\n\r?\n/)[0];
  return headerBlock
    .split(/\r?\n/)
    .filter((line) => !/^\s/.test(line))
    .map((line) => line.split(':')[0].toLowerCase());
}

describe.each([
  ['BrevoEmailAdapter', () => new BrevoEmailAdapter(config)],
  ['MailhogEmailAdapter', () => new MailhogEmailAdapter(config)],
])('%s header sanitization (real nodemailer)', (_name, build) => {
  it('does not let a tenant name with quotes/CRLF inject extra headers', async () => {
    const raw = await captureRawMessage(build());

    const names = headerNames(raw);
    expect(names).not.toContain('bcc');
    expect(names).not.toContain('x-injected');
    expect(names.filter((n) => n === 'from')).toHaveLength(1);
  });

  it('sets From to the platform address and Reply-To to the tenant contact', async () => {
    const raw = await captureRawMessage(build());

    // Unfold RFC 5322 folded headers (continuation lines start with whitespace) before matching.
    const unfolded = raw.replace(/\r?\n[ \t]+/g, ' ');
    expect(unfolded).toMatch(/^From: .*<noreply@ikaro\.example>/im);
    expect(unfolded).toMatch(/^Reply-To: contato@lavacar\.example/im);
  });
});
