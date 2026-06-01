import { Inject, Injectable } from '@nestjs/common';
import { formatBRL } from '../../../../../shared/utils/money-format';
import { utcDateToLocalDate, utcDateToLocalHHMM } from '../../../../../shared/utils/calendar-date';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendBookingCancelledNotificationDto } from '../../dtos/send-booking-cancelled-notification.dto';
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
import {
  INotificationTenantPort,
  NOTIFICATION_TENANT_PORT,
} from '../../ports/notification-tenant.port';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const CHANNEL = 'EMAIL';

export interface SendBookingCancelledNotificationUseCaseResult {
  customerEmailSent: boolean;
  adminEmailSent: boolean;
}

@Injectable()
export class SendBookingCancelledNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_PROCESSED_EVENT_REPOSITORY)
    processedEventRepo: INotificationProcessedEventRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_STAFF_PORT) private readonly staffPort: INotificationStaffPort,
    @Inject(NOTIFICATION_TENANT_PORT) private readonly tenantPort: INotificationTenantPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
  ) {
    super(logRepo, processedEventRepo, dispatcher, txManager);
  }

  async execute(
    dto: SendBookingCancelledNotificationDto,
  ): Promise<SendBookingCancelledNotificationUseCaseResult> {
    const [customerSent, adminSent] = await Promise.all([
      this.isAlreadySent(dto.eventId, NotificationTemplateKey.BOOKING_CANCELLED_CUSTOMER, CHANNEL),
      this.isAlreadySent(dto.eventId, NotificationTemplateKey.BOOKING_CANCELLED_ADMIN, CHANNEL),
    ]);

    if (customerSent && adminSent) {
      return { customerEmailSent: false, adminEmailSent: false };
    }

    const tenantInfo = await this.tenantPort.getTenantInfo(dto.tenantId);
    const timezone = tenantInfo?.timezone ?? 'America/Sao_Paulo';

    const scheduledDate = new Date(dto.scheduledAt);
    const localDate = utcDateToLocalDate(scheduledDate, timezone);
    const localTime = utcDateToLocalHHMM(scheduledDate, timezone);

    const serviceNames = dto.lineSummary.map((l) => l.serviceNameAtBooking).join(', ');
    const formattedTotal = formatBRL(dto.totalPrice.amount);

    let customerEmailSent = false;
    let adminEmailSent = false;

    if (!customerSent) {
      try {
        await this.dispatcher.dispatch({
          tenantId: dto.tenantId,
          to: dto.guestEmail,
          subject: 'Seu agendamento foi cancelado',
          templateKey: NotificationTemplateKey.BOOKING_CANCELLED_CUSTOMER,
          data: {
            serviceNames,
            totalPrice: formattedTotal,
            guestName: dto.guestName,
            localDate,
            localTime,
          },
        });
        await this.saveLog(
          dto.tenantId,
          dto.eventId,
          NotificationTemplateKey.BOOKING_CANCELLED_CUSTOMER,
          CHANNEL,
          dto.guestEmail,
        );
        customerEmailSent = true;
      } catch (err: unknown) {
        await this.saveFailedLog(
          dto.tenantId,
          dto.eventId,
          NotificationTemplateKey.BOOKING_CANCELLED_CUSTOMER,
          CHANNEL,
          dto.guestEmail,
          String(err),
        );
        throw err;
      }
    }

    if (!adminSent) {
      const managerEmails = await this.staffPort.getManagerEmails(dto.tenantId);
      if (managerEmails.length > 0) {
        try {
          await Promise.all(
            managerEmails.map((email) =>
              this.dispatcher.dispatch({
                tenantId: dto.tenantId,
                to: email,
                subject: 'Agendamento cancelado',
                templateKey: NotificationTemplateKey.BOOKING_CANCELLED_ADMIN,
                data: {
                  guestName: dto.guestName,
                  localDate,
                  localTime,
                  serviceNames,
                  totalPrice: formattedTotal,
                  cancelledBy: dto.cancelledBy,
                  isBusiness: dto.isBusiness,
                  reason: dto.reason,
                },
              }),
            ),
          );
          await this.saveLog(
            dto.tenantId,
            dto.eventId,
            NotificationTemplateKey.BOOKING_CANCELLED_ADMIN,
            CHANNEL,
            managerEmails[0],
          );
          adminEmailSent = true;
        } catch (err: unknown) {
          await this.saveFailedLog(
            dto.tenantId,
            dto.eventId,
            NotificationTemplateKey.BOOKING_CANCELLED_ADMIN,
            CHANNEL,
            managerEmails[0],
            String(err),
          );
          throw err;
        }
      }
    }

    return { customerEmailSent, adminEmailSent };
  }
}
