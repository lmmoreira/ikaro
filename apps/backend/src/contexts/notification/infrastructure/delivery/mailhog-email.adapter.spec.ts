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
      from: 'noreply@ikaro.example',
      subject: 'Teste',
      html: '<p>Olá</p>',
    });

    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'noreply@ikaro.example',
      to: 'joao@example.com',
      subject: 'Teste',
      html: '<!doctype html><html><head><meta charset="utf-8"></head><body><p>Olá</p></body></html>',
      text: 'Olá',
    });
  });

  it('passes a structured from {name,address} and replyTo when provided', async () => {
    await adapter.send({
      to: 'joao@example.com',
      from: 'noreply@ikaro.example',
      fromName: 'Lava Car',
      replyTo: 'contato@lavacar.example',
      subject: 'Teste',
      html: '<p>Olá</p>',
    });

    expect(mockSendMail).toHaveBeenCalledWith({
      from: { name: 'Lava Car', address: 'noreply@ikaro.example' },
      replyTo: 'contato@lavacar.example',
      to: 'joao@example.com',
      subject: 'Teste',
      html: '<!doctype html><html><head><meta charset="utf-8"></head><body><p>Olá</p></body></html>',
      text: 'Olá',
    });
  });

  it('does not contain a render() method', () => {
    expect((adapter as unknown as Record<string, unknown>)['render']).toBeUndefined();
  });
});
