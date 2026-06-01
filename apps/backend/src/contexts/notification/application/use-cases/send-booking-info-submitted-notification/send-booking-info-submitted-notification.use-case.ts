import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendBookingInfoSubmittedNotificationDto } from '../../dtos/send-booking-info-submitted-notification.dto';
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
import {
  INotificationStaffPort,
  NOTIFICATION_STAFF_PORT,
} from '../../ports/notification-staff.port';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const CHANNEL = 'EMAIL';

export interface SendBookingInfoSubmittedNotificationUseCaseResult {
  emailSent: boolean;
}

@Injectable()
export class SendBookingInfoSubmittedNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_PROCESSED_EVENT_REPOSITORY)
    processedEventRepo: INotificationProcessedEventRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_STAFF_PORT) private readonly staffPort: INotificationStaffPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    private readonly config: ConfigService,
  ) {
    super(logRepo, processedEventRepo, dispatcher, txManager);
  }

  async execute(
    dto: SendBookingInfoSubmittedNotificationDto,
  ): Promise<SendBookingInfoSubmittedNotificationUseCaseResult> {
    if (
      await this.isAlreadySent(
        dto.eventId,
        NotificationTemplateKey.BOOKING_INFO_SUBMITTED_ADMIN,
        CHANNEL,
      )
    ) {
      return { emailSent: false };
    }

    const managerEmails = await this.staffPort.getManagerEmails(dto.tenantId);
    if (managerEmails.length === 0) return { emailSent: false };

    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const bookingLink = `${frontendUrl}/dashboard/bookings/${dto.bookingId}`;
    const customerResponse =
      typeof dto.infoPayload['notes'] === 'string' ? dto.infoPayload['notes'] : '';

    try {
      await Promise.all(
        managerEmails.map((email) =>
          this.dispatcher.dispatch({
            tenantId: dto.tenantId,
            to: email,
            subject: 'Cliente respondeu à solicitação de informações',
            templateKey: NotificationTemplateKey.BOOKING_INFO_SUBMITTED_ADMIN,
            data: {
              submittedByEmail: dto.submittedByEmail,
              bookingId: dto.bookingId,
              customerResponse,
              bookingLink,
            },
          }),
        ),
      );
      await this.saveLog(
        dto.tenantId,
        dto.eventId,
        NotificationTemplateKey.BOOKING_INFO_SUBMITTED_ADMIN,
        CHANNEL,
        managerEmails[0],
      );
      return { emailSent: true };
    } catch (err: unknown) {
      await this.saveFailedLog(
        dto.tenantId,
        dto.eventId,
        NotificationTemplateKey.BOOKING_INFO_SUBMITTED_ADMIN,
        CHANNEL,
        managerEmails[0],
        String(err),
      );
      throw err;
    }
  }
}
