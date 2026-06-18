import { ConfigService } from '@nestjs/config';
import { EmailDeliveryChannelAdapter } from './email-delivery-channel.adapter';
import { IEmailSender } from '../../application/ports/email-sender.port';
import { INotificationPlatformPort } from '../../application/ports/notification-platform.port';
import { OutboundMessage } from '../../application/ports/notification-dispatcher.port';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

function makeAdapter(fromEmail: string | null = null): {
  adapter: EmailDeliveryChannelAdapter;
  emailSender: jest.Mocked<IEmailSender>;
  configService: ConfigService;
} {
  const emailSender: jest.Mocked<IEmailSender> = { send: jest.fn().mockResolvedValue(undefined) };
  const tenantPort: INotificationPlatformPort = {
    getTenantInfo: jest.fn().mockResolvedValue({
      id: TENANT_ID,
      name: 'Lava Car',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
      fromEmail,
    }),
  };
  const configService = {
    get: jest.fn().mockReturnValue('noreply@ikaro.example'),
  } as unknown as ConfigService;
  const adapter = new EmailDeliveryChannelAdapter(emailSender, tenantPort, configService);
  return { adapter, emailSender, configService };
}

const baseMessage: OutboundMessage = {
  tenantId: TENANT_ID,
  to: 'joao@example.com',
  subject: 'Seu agendamento foi confirmado!',
  body: '<p>Olá, João Silva! Seu agendamento foi confirmado.</p>',
  channel: 'EMAIL',
};

describe('EmailDeliveryChannelAdapter', () => {
  it('has channelType EMAIL', () => {
    const { adapter } = makeAdapter();
    expect(adapter.channelType).toBe('EMAIL');
  });

  describe('from address resolution', () => {
    it('uses tenantInfo.fromEmail when set', async () => {
      const { adapter, emailSender } = makeAdapter('lavagem@ikaro.example');

      await adapter.send(baseMessage);

      const call = emailSender.send.mock.calls[0][0];
      expect(call.from).toBe('lavagem@ikaro.example');
    });

    it('falls back to EMAIL_FROM config when fromEmail is null', async () => {
      const { adapter, emailSender } = makeAdapter(null);

      await adapter.send(baseMessage);

      const call = emailSender.send.mock.calls[0][0];
      expect(call.from).toBe('noreply@ikaro.example');
    });
  });

  describe('IEmailSender delegation', () => {
    it('passes pre-rendered subject and body directly to emailSender', async () => {
      const { adapter, emailSender } = makeAdapter();

      await adapter.send(baseMessage);

      const call = emailSender.send.mock.calls[0][0];
      expect(call.to).toBe('joao@example.com');
      expect(call.subject).toBe('Seu agendamento foi confirmado!');
      expect(call.html).toBe('<p>Olá, João Silva! Seu agendamento foi confirmado.</p>');
    });

    it('does not modify subject or body — passes them verbatim', async () => {
      const { adapter, emailSender } = makeAdapter();
      const customBody = '<p>Custom pre-rendered body with {{unreplaced}} placeholder</p>';

      await adapter.send({ ...baseMessage, body: customBody });

      const call = emailSender.send.mock.calls[0][0];
      expect(call.html).toBe(customBody);
    });
  });
});
