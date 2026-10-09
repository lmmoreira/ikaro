import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryChannelType,
  IDeliveryChannel,
} from '../../application/ports/delivery-channel.port';
import { EMAIL_SENDER, IEmailSender } from '../../application/ports/email-sender.port';
import { OutboundMessage } from '../../application/ports/notification-dispatcher.port';
import {
  INotificationPlatformPort,
  NOTIFICATION_PLATFORM_PORT,
} from '../../application/ports/notification-platform.port';

@Injectable()
export class EmailDeliveryChannelAdapter implements IDeliveryChannel {
  readonly channelType: DeliveryChannelType = 'EMAIL';

  constructor(
    @Inject(EMAIL_SENDER) private readonly emailSender: IEmailSender,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    private readonly config: ConfigService,
  ) {}

  async send(message: OutboundMessage): Promise<void> {
    const tenantInfo = await this.tenantPort.getTenantInfo(message.tenantId);
    const from = this.config.get<string>('EMAIL_FROM', 'noreply@ikaro.example');

    await this.emailSender.send({
      to: message.to,
      from,
      fromName: tenantInfo?.name,
      replyTo: tenantInfo?.replyToEmail ?? undefined,
      subject: message.subject,
      html: message.body,
      lang: tenantInfo?.locale,
    });
  }
}
