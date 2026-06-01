import { IDeliveryChannel } from '../../application/ports/delivery-channel.port';
import { OutboundMessage } from '../../application/ports/notification-dispatcher.port';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { NotificationDispatcherAdapter } from './notification-dispatcher.adapter';

const message: OutboundMessage = {
  tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
  to: 'maria@lavacar.com.br',
  subject: 'Convite',
  templateKey: NotificationTemplateKey.STAFF_INVITATION,
  data: {},
};

function makeChannel(channelType: 'EMAIL' | 'WHATSAPP' = 'EMAIL'): jest.Mocked<IDeliveryChannel> {
  return { channelType, send: jest.fn().mockResolvedValue(undefined) };
}

describe('NotificationDispatcherAdapter', () => {
  it('calls send on all registered channels', async () => {
    const email = makeChannel('EMAIL');
    const whatsapp = makeChannel('WHATSAPP');
    const dispatcher = new NotificationDispatcherAdapter([email, whatsapp]);

    await dispatcher.dispatch(message);

    expect(email.send).toHaveBeenCalledWith(message);
    expect(whatsapp.send).toHaveBeenCalledWith(message);
  });

  it('rethrows when a channel send fails', async () => {
    const failing = makeChannel();
    failing.send.mockRejectedValue(new Error('SMTP down'));
    const dispatcher = new NotificationDispatcherAdapter([failing]);

    await expect(dispatcher.dispatch(message)).rejects.toThrow('SMTP down');
  });

  it('works with a single channel', async () => {
    const channel = makeChannel();
    const dispatcher = new NotificationDispatcherAdapter([channel]);

    await dispatcher.dispatch(message);

    expect(channel.send).toHaveBeenCalledTimes(1);
  });
});
