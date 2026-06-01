import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendBookingRejectedNotificationDto } from '../../dtos/send-booking-rejected-notification.dto';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../../ports/notification-dispatcher.port';
import {
  INotificationLogRepository,
  NOTIFICATION_LOG_REPOSITORY,
} from '../../ports/notification-log-repository.port';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const CHANNEL = 'EMAIL';

export interface SendBookingRejectedNotificationUseCaseResult {
  emailSent: boolean;
}

@Injectable()
export class SendBookingRejectedNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
  ) {
    super(logRepo, dispatcher, txManager);
  }

  async execute(
    dto: SendBookingRejectedNotificationDto,
  ): Promise<SendBookingRejectedNotificationUseCaseResult> {
    if (
      await this.isAlreadySent(
        dto.tenantId,
        dto.eventId,
        NotificationTemplateKey.BOOKING_REJECTED_CUSTOMER,
        CHANNEL,
      )
    ) {
      return { emailSent: false };
    }

    await this.dispatcher.dispatch({
      tenantId: dto.tenantId,
      to: dto.guestEmail,
      subject: 'Sobre seu pedido de agendamento',
      templateKey: NotificationTemplateKey.BOOKING_REJECTED_CUSTOMER,
      data: {
        guestName: dto.guestName,
        reason: dto.reason,
      },
    });

    await this.saveLog(
      dto.tenantId,
      dto.eventId,
      NotificationTemplateKey.BOOKING_REJECTED_CUSTOMER,
      CHANNEL,
    );
    return { emailSent: true };
  }
}
