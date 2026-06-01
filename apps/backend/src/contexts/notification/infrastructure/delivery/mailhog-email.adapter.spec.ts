import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailhogEmailAdapter } from './mailhog-email.adapter';

jest.mock('nodemailer');

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
(nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: mockSendMail });

const configService = {
  get: jest.fn().mockReturnValue(undefined),
} as unknown as ConfigService;

describe('MailhogEmailAdapter', () => {
  let adapter: MailhogEmailAdapter;

  beforeEach(() => {
    mockSendMail.mockClear();
    adapter = new MailhogEmailAdapter(configService);
  });

  it('calls sendMail with correct to, from, subject, html', async () => {
    await adapter.send({
      to: 'joao@example.com',
      from: 'noreply@beloauto.com.br',
      subject: 'Teste',
      html: '<p>Olá</p>',
    });

    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'noreply@beloauto.com.br',
      to: 'joao@example.com',
      subject: 'Teste',
      html: '<p>Olá</p>',
    });
  });

  it('does not contain a render() method', () => {
    expect((adapter as unknown as Record<string, unknown>)['render']).toBeUndefined();
  });
});
