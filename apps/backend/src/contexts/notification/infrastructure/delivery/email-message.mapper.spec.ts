import * as nodemailer from 'nodemailer';
import { toNodemailerMessage } from './email-message.mapper';
import { EmailSendOptions } from '../../application/ports/email-sender.port';

// Real nodemailer, no module mock: the mapped message is composed into its raw RFC 5322 form by
// nodemailer's own streamTransport, proving a tenant-controlled display name cannot inject
// headers (a mocked transporter could only show a structured object was passed).
const HOSTILE_NAME = 'Evil "Wash"\r\nBcc: attacker@evil.example\r\nX-Injected: 1';

const options: EmailSendOptions = {
  to: 'joao@example.com',
  from: 'noreply@ikaro.example',
  fromName: HOSTILE_NAME,
  replyTo: 'contato@lavacar.example',
  subject: 'Teste',
  html: '<p>Olá</p>',
};

async function compose(message: ReturnType<typeof toNodemailerMessage>): Promise<string> {
  const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const info = (await transporter.sendMail(message)) as { message: Buffer };
  return info.message.toString('utf8');
}

function headerNames(raw: string): string[] {
  const headerBlock = raw.split(/\r?\n\r?\n/)[0];
  return headerBlock
    .split(/\r?\n/)
    .filter((line) => !/^\s/.test(line))
    .map((line) => line.split(':')[0].toLowerCase());
}

describe('toNodemailerMessage', () => {
  it('maps From to a structured {name,address} when a display name is given', () => {
    expect(toNodemailerMessage({ ...options, fromName: 'Lava Car' })).toEqual({
      to: 'joao@example.com',
      from: { name: 'Lava Car', address: 'noreply@ikaro.example' },
      replyTo: 'contato@lavacar.example',
      subject: 'Teste',
      html: '<p>Olá</p>',
    });
  });

  it('keeps From as the bare address and omits replyTo when neither is given', () => {
    const message = toNodemailerMessage({
      to: options.to,
      from: options.from,
      subject: options.subject,
      html: options.html,
    });

    expect(message.from).toBe('noreply@ikaro.example');
    expect(message.replyTo).toBeUndefined();
  });

  it('does not let a tenant name with quotes/CRLF inject extra headers', async () => {
    const raw = await compose(toNodemailerMessage(options));

    const names = headerNames(raw);
    expect(names).not.toContain('bcc');
    expect(names).not.toContain('x-injected');
    expect(names.filter((n) => n === 'from')).toHaveLength(1);
  });

  it('composes From with the platform address and Reply-To with the tenant contact', async () => {
    const raw = await compose(toNodemailerMessage(options));

    // Unfold RFC 5322 folded headers (continuation lines start with whitespace) before matching.
    const unfolded = raw.replace(/\r?\n[ \t]+/g, ' ');
    expect(unfolded).toMatch(/^From: .*<noreply@ikaro\.example>/im);
    expect(unfolded).toMatch(/^Reply-To: contato@lavacar\.example/im);
  });
});
