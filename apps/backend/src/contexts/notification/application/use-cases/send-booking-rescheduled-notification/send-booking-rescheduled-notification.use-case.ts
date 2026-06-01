import { Inject, Injectable } from '@nestjs/common';
import { formatBRL } from '../../../../../shared/utils/money-format';
import { utcDateToLocalDate, utcDateToLocalHHMM } from '../../../../../shared/utils/calendar-date';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendBookingRescheduledNotificationDto } from '../../dtos/send-booking-rescheduled-notification.dto';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../../ports/notification-dispatcher.port';
import {
  INotificationLogRepository,
  NOTIFICATION_LOG_REPOSITORY,
} from '../../ports/notification-log-repository.port';
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

export interface SendBookingRescheduledNotificationUseCaseResult {
  customerEmailSent: boolean;
  adminEmailSent: boolean;
}

@Injectable()
export class SendBookingRescheduledNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_STAFF_PORT) private readonly staffPort: INotificationStaffPort,
    @Inject(NOTIFICATION_TENANT_PORT) private readonly tenantPort: INotificationTenantPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
  ) {
    super(logRepo, dispatcher, txManager);
  }

  async execute(
    dto: SendBookingRescheduledNotificationDto,
  ): Promise<SendBookingRescheduledNotificationUseCaseResult> {
    const [customerSent, adminSent] = await Promise.all([
      this.isAlreadySent(
        dto.tenantId,
        dto.eventId,
        NotificationTemplateKey.BOOKING_RESCHEDULED_CUSTOMER,
        CHANNEL,
      ),
      this.isAlreadySent(
        dto.tenantId,
        dto.eventId,
        NotificationTemplateKey.BOOKING_RESCHEDULED_ADMIN,
        CHANNEL,
      ),
    ]);

    if (customerSent && adminSent) {
      return { customerEmailSent: false, adminEmailSent: false };
    }

    const tenantInfo = await this.tenantPort.getTenantInfo(dto.tenantId);
    const timezone = tenantInfo?.timezone ?? 'America/Sao_Paulo';

    const previousStart = new Date(dto.previousSlot.startTime);
    const newStart = new Date(dto.newSlot.startTime);

    const previousLocalDate = utcDateToLocalDate(previousStart, timezone);
    const previousLocalTime = utcDateToLocalHHMM(previousStart, timezone);
    const newLocalDate = utcDateToLocalDate(newStart, timezone);
    const newLocalTime = utcDateToLocalHHMM(newStart, timezone);

    const serviceNames = dto.lineSummary.map((l) => l.serviceNameAtBooking).join(', ');
    const formattedTotal = formatBRL(dto.totalPrice.amount);

    let customerEmailSent = false;
    let adminEmailSent = false;

    if (!customerSent) {
      await this.dispatcher.dispatch({
        tenantId: dto.tenantId,
        to: dto.guestEmail,
        subject: 'Seu agendamento foi reagendado',
        templateKey: NotificationTemplateKey.BOOKING_RESCHEDULED_CUSTOMER,
        data: {
          serviceNames,
          totalPrice: formattedTotal,
          guestName: dto.guestName,
          previousLocalDate,
          previousLocalTime,
          newLocalDate,
          newLocalTime,
        },
      });
      await this.saveLog(
        dto.tenantId,
        dto.eventId,
        NotificationTemplateKey.BOOKING_RESCHEDULED_CUSTOMER,
        CHANNEL,
      );
      customerEmailSent = true;
    }

    if (!adminSent) {
      const managerEmails = await this.staffPort.getManagerEmails(dto.tenantId);
      if (managerEmails.length > 0) {
        await Promise.all(
          managerEmails.map((email) =>
            this.dispatcher.dispatch({
              tenantId: dto.tenantId,
              to: email,
              subject: 'Agendamento reagendado',
              templateKey: NotificationTemplateKey.BOOKING_RESCHEDULED_ADMIN,
              data: {
                guestName: dto.guestName,
                previousLocalDate,
                previousLocalTime,
                newLocalDate,
                newLocalTime,
                serviceNames,
                totalPrice: formattedTotal,
              },
            }),
          ),
        );
        await this.saveLog(
          dto.tenantId,
          dto.eventId,
          NotificationTemplateKey.BOOKING_RESCHEDULED_ADMIN,
          CHANNEL,
        );
        adminEmailSent = true;
      }
    }

    return { customerEmailSent, adminEmailSent };
  }
}
