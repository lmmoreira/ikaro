import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { BrevoEmailAdapter } from './brevo-email.adapter';
import { EmailDeliveryException } from '../../domain/errors/notification-domain.error';

jest.mock('nodemailer');

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
(nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: mockSendMail });

const configService = {
  get: jest.fn((key: string) => {
    if (key === 'BREVO_SMTP_LOGIN') return 'account@example.com';
    if (key === 'BREVO_SMTP_KEY') return 'fake-smtp-key';
    return '';
  }),
} as unknown as ConfigService;

describe('BrevoEmailAdapter', () => {
  let adapter: BrevoEmailAdapter;

  beforeEach(() => {
    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({ messageId: 'test-id' });
    (nodemailer.createTransport as jest.Mock).mockClear();
    adapter = new BrevoEmailAdapter(configService);
  });

  it('creates the transporter against the Brevo SMTP relay with the configured credentials', () => {
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: 'account@example.com',
        pass: 'fake-smtp-key',
      },
    });
  });

  it('calls sendMail with correct to, from, subject, html', async () => {
    await adapter.send({
      to: 'joao@example.com',
      from: 'noreply@ikaro.example',
      subject: 'Teste',
      html: '<p>Olá</p>',
    });

    expect(mockSendMail).toHaveBeenCalledWith({
      to: 'joao@example.com',
      from: 'noreply@ikaro.example',
      subject: 'Teste',
      html: '<p>Olá</p>',
    });
  });

  it('throws EmailDeliveryException on send failure', async () => {
    mockSendMail.mockRejectedValue(new Error('Relay rejected'));

    await expect(
      adapter.send({
        to: 'joao@example.com',
        from: 'noreply@ikaro.example',
        subject: 'Teste',
        html: '<p>Olá</p>',
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryException);
  });

  it('error message does not contain the BREVO_SMTP_KEY value', async () => {
    mockSendMail.mockRejectedValue(new Error('some error'));

    try {
      await adapter.send({
        to: 'joao@example.com',
        from: 'noreply@ikaro.example',
        subject: 'Teste',
        html: '<p>Olá</p>',
      });
    } catch (err: unknown) {
      expect(err instanceof Error ? err.message : '').not.toContain('fake-smtp-key');
    }
  });

  it('does not contain a render() method', () => {
    expect((adapter as unknown as Record<string, unknown>)['render']).toBeUndefined();
  });
});
