import { IDeliveryChannel } from '../../application/ports/delivery-channel.port';
import { OutboundMessage } from '../../application/ports/notification-dispatcher.port';
import { NotificationDispatcherAdapter } from './notification-dispatcher.adapter';

const emailMessage: OutboundMessage = {
  tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
  to: 'maria@lavacar.com.br',
  subject: 'Convite',
  body: '<p>Corpo do email</p>',
  channel: 'EMAIL',
  notificationType: 'staff-invitation',
};

function makeChannel(channelType: 'EMAIL' | 'WHATSAPP' = 'EMAIL'): jest.Mocked<IDeliveryChannel> {
  return { channelType, send: jest.fn().mockResolvedValue(undefined) };
}

describe('NotificationDispatcherAdapter', () => {
  it('routes to the matching channel adapter', async () => {
    const email = makeChannel('EMAIL');
    const whatsapp = makeChannel('WHATSAPP');
    const dispatcher = new NotificationDispatcherAdapter([email, whatsapp]);

    await dispatcher.dispatch(emailMessage);

    expect(email.send).toHaveBeenCalledWith(emailMessage);
    expect(whatsapp.send).not.toHaveBeenCalled();
  });

  it('routes WHATSAPP message to the WHATSAPP adapter only', async () => {
    const email = makeChannel('EMAIL');
    const whatsapp = makeChannel('WHATSAPP');
    const dispatcher = new NotificationDispatcherAdapter([email, whatsapp]);
    const whatsappMessage: OutboundMessage = { ...emailMessage, channel: 'WHATSAPP' };

    await dispatcher.dispatch(whatsappMessage);

    expect(whatsapp.send).toHaveBeenCalledWith(whatsappMessage);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('skips with no error when no adapter matches the channel', async () => {
    const email = makeChannel('EMAIL');
    const dispatcher = new NotificationDispatcherAdapter([email]);
    const smsMessage: OutboundMessage = { ...emailMessage, channel: 'SMS' as const };

    await expect(dispatcher.dispatch(smsMessage)).resolves.not.toThrow();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('rethrows when the matching channel send fails', async () => {
    const failing = makeChannel('EMAIL');
    failing.send.mockRejectedValue(new Error('SMTP down'));
    const dispatcher = new NotificationDispatcherAdapter([failing]);

    await expect(dispatcher.dispatch(emailMessage)).rejects.toThrow('SMTP down');
  });

  it('works with a single channel', async () => {
    const channel = makeChannel('EMAIL');
    const dispatcher = new NotificationDispatcherAdapter([channel]);

    await dispatcher.dispatch(emailMessage);

    expect(channel.send).toHaveBeenCalledTimes(1);
  });
});
