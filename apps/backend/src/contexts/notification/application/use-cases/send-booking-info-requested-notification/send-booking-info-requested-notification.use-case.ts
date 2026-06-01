import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendBookingInfoRequestedNotificationDto } from '../../dtos/send-booking-info-requested-notification.dto';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../../ports/notification-dispatcher.port';
import {
  INotificationLogRepository,
  NOTIFICATION_LOG_REPOSITORY,
} from '../../ports/notification-log-repository.port';
import {
  INotificationProcessedEventRepository,
  NOTIFICATION_PROCESSED_EVENT_REPOSITORY,
} from '../../ports/processed-event-repository.port';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const CHANNEL = 'EMAIL';
const GUEST_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface SendBookingInfoRequestedNotificationUseCaseResult {
  emailSent: boolean;
}

@Injectable()
export class SendBookingInfoRequestedNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_PROCESSED_EVENT_REPOSITORY)
    processedEventRepo: INotificationProcessedEventRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    private readonly config: ConfigService,
  ) {
    super(logRepo, processedEventRepo, dispatcher, txManager);
  }

  async execute(
    dto: SendBookingInfoRequestedNotificationDto,
  ): Promise<SendBookingInfoRequestedNotificationUseCaseResult> {
    if (
      await this.isAlreadySent(
        dto.eventId,
        NotificationTemplateKey.BOOKING_INFO_REQUESTED_CUSTOMER,
        CHANNEL,
      )
    ) {
      return { emailSent: false };
    }

    const respondLink = this.buildRespondLink(dto);

    try {
      await this.dispatcher.dispatch({
        tenantId: dto.tenantId,
        to: dto.guestEmail,
        subject: 'Precisamos de mais informações sobre seu agendamento',
        templateKey: NotificationTemplateKey.BOOKING_INFO_REQUESTED_CUSTOMER,
        data: {
          guestName: dto.guestName,
          informationNeeded: dto.informationNeeded,
          respondLink,
        },
      });
      await this.saveLog(
        dto.tenantId,
        dto.eventId,
        NotificationTemplateKey.BOOKING_INFO_REQUESTED_CUSTOMER,
        CHANNEL,
        dto.guestEmail,
      );
      return { emailSent: true };
    } catch (err: unknown) {
      await this.saveFailedLog(
        dto.tenantId,
        dto.eventId,
        NotificationTemplateKey.BOOKING_INFO_REQUESTED_CUSTOMER,
        CHANNEL,
        dto.guestEmail,
        String(err),
      );
      throw err;
    }
  }

  private buildRespondLink(dto: SendBookingInfoRequestedNotificationDto): string {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');

    if (dto.customerId !== null) {
      return `${frontendUrl}/dashboard/bookings/${dto.bookingId}`;
    }

    const secret = this.config.getOrThrow<string>('JWT_SECRET');

    const token = jwt.sign(
      { bookingId: dto.bookingId, tenantId: dto.tenantId, guestEmail: dto.guestEmail },
      secret,
      { expiresIn: GUEST_TOKEN_TTL_SECONDS },
    );

    return `${frontendUrl}/bookings/${dto.bookingId}/responder?token=${token}`;
  }
}
