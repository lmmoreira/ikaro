import { ConfigService } from '@nestjs/config';
import { EmailDeliveryChannelAdapter } from './email-delivery-channel.adapter';
import { InMemoryEmailSender } from '../../../../test/infrastructure/in-memory-email-sender';
import { InMemoryNotificationPlatformPort } from '../../../../test/infrastructure/in-memory-notification-platform.port';
import { OutboundMessage } from '../../application/ports/notification-dispatcher.port';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

function makeAdapter(replyToEmail: string | null = null): {
  adapter: EmailDeliveryChannelAdapter;
  emailSender: InMemoryEmailSender;
  configService: ConfigService;
} {
  const emailSender = new InMemoryEmailSender();
  const tenantPort = new InMemoryNotificationPlatformPort();
  tenantPort.setTenantInfo(TENANT_ID, {
    id: TENANT_ID,
    name: 'Lava Car',
    slug: 'lavacar',
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
    replyToEmail,
  });
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
  notificationType: 'booking-approved-customer',
};

describe('EmailDeliveryChannelAdapter', () => {
  it('has channelType EMAIL', () => {
    const { adapter } = makeAdapter();
    expect(adapter.channelType).toBe('EMAIL');
  });

  describe('sender resolution', () => {
    it('always sends From the platform EMAIL_FROM with the tenant name as display name', async () => {
      const { adapter, emailSender } = makeAdapter();

      await adapter.send(baseMessage);

      const call = emailSender.sent[0];
      expect(call.from).toBe('noreply@ikaro.example');
      expect(call.fromName).toBe('Lava Car');
    });

    it('sets replyTo to the tenant replyToEmail when present', async () => {
      const { adapter, emailSender } = makeAdapter('contato@lavacar.example');

      await adapter.send(baseMessage);

      expect(emailSender.sent[0].replyTo).toBe('contato@lavacar.example');
    });

    it('leaves replyTo undefined when the tenant has no replyToEmail', async () => {
      const { adapter, emailSender } = makeAdapter(null);

      await adapter.send(baseMessage);

      expect(emailSender.sent[0].replyTo).toBeUndefined();
    });

    it('still sends From EMAIL_FROM, with no fromName/replyTo, when tenant info is unavailable', async () => {
      const emailSender = new InMemoryEmailSender();
      const configService = {
        get: jest.fn().mockReturnValue('noreply@ikaro.example'),
      } as unknown as ConfigService;
      const adapter = new EmailDeliveryChannelAdapter(
        emailSender,
        new InMemoryNotificationPlatformPort(),
        configService,
      );

      await adapter.send(baseMessage);

      const call = emailSender.sent[0];
      expect(call.from).toBe('noreply@ikaro.example');
      expect(call.fromName).toBeUndefined();
      expect(call.replyTo).toBeUndefined();
    });
  });

  describe('IEmailSender delegation', () => {
    it('passes pre-rendered subject and body directly to emailSender', async () => {
      const { adapter, emailSender } = makeAdapter();

      await adapter.send(baseMessage);

      const call = emailSender.sent[0];
      expect(call.to).toBe('joao@example.com');
      expect(call.subject).toBe('Seu agendamento foi confirmado!');
      expect(call.html).toBe('<p>Olá, João Silva! Seu agendamento foi confirmado.</p>');
    });

    it('passes the tenant language so the document states it', async () => {
      const { adapter, emailSender } = makeAdapter();

      await adapter.send(baseMessage);

      expect(emailSender.sent[0].lang).toBe('pt-BR');
    });

    it('does not modify subject or body — passes them verbatim', async () => {
      const { adapter, emailSender } = makeAdapter();
      const customBody = '<p>Custom pre-rendered body with {{unreplaced}} placeholder</p>';

      await adapter.send({ ...baseMessage, body: customBody });

      const call = emailSender.sent[0];
      expect(call.html).toBe(customBody);
    });
  });
});
