import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';
import { SendGridEmailAdapter } from './sendgrid-email.adapter';
import { EmailDeliveryException } from '../../domain/errors/notification-domain.error';

jest.mock('@sendgrid/mail', () => {
  const mock = {
    setApiKey: jest.fn(),
    send: jest.fn(),
  };
  return { ...mock, default: mock };
});

const mockSend = sgMail.send as unknown as jest.Mock;

const configService = {
  get: jest.fn().mockReturnValue('SG.test-key'),
} as unknown as ConfigService;

const mockSetApiKey = sgMail.setApiKey as unknown as jest.Mock;

describe('SendGridEmailAdapter', () => {
  let adapter: SendGridEmailAdapter;

  beforeEach(() => {
    mockSend.mockReset();
    mockSetApiKey.mockReset();
    adapter = new SendGridEmailAdapter(configService);
  });

  it('calls sgMail.setApiKey with the configured key on onModuleInit when key is set', () => {
    adapter.onModuleInit();
    expect(mockSetApiKey).toHaveBeenCalledWith('SG.test-key');
  });

  it('does not call sgMail.setApiKey on onModuleInit when key is empty', () => {
    const emptyConfig = { get: jest.fn().mockReturnValue('') } as unknown as ConfigService;
    const emptyAdapter = new SendGridEmailAdapter(emptyConfig);
    emptyAdapter.onModuleInit();
    expect(mockSetApiKey).not.toHaveBeenCalled();
  });

  it('calls sgMail.send with correct args', async () => {
    mockSend.mockResolvedValue([{ statusCode: 202 }]);

    await adapter.send({
      to: 'joao@example.com',
      from: 'noreply@ikaro.example',
      subject: 'Teste',
      html: '<p>Olá</p>',
    });

    expect(mockSend).toHaveBeenCalledWith({
      to: 'joao@example.com',
      from: 'noreply@ikaro.example',
      subject: 'Teste',
      html: '<p>Olá</p>',
    });
  });

  it('throws EmailDeliveryException on send failure', async () => {
    mockSend.mockRejectedValue(new Error('Forbidden'));

    await expect(
      adapter.send({
        to: 'joao@example.com',
        from: 'noreply@ikaro.example',
        subject: 'Teste',
        html: '<p>Olá</p>',
      }),
    ).rejects.toBeInstanceOf(EmailDeliveryException);
  });

  it('error message does not contain SENDGRID_API_KEY value', async () => {
    mockSend.mockRejectedValue(new Error('some error'));

    try {
      await adapter.send({
        to: 'joao@example.com',
        from: 'noreply@ikaro.example',
        subject: 'Teste',
        html: '<p>Olá</p>',
      });
    } catch (err: unknown) {
      expect(err instanceof Error ? err.message : '').not.toContain('SG.test-key');
    }
  });

  it('does not contain a render() method', () => {
    expect((adapter as unknown as Record<string, unknown>)['render']).toBeUndefined();
  });
});
