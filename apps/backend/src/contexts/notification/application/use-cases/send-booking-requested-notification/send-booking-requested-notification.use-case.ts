import { Inject, Injectable } from '@nestjs/common';
import { formatBRL } from '../../../../../shared/utils/money-format';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendBookingRequestedNotificationDto } from '../../dtos/send-booking-requested-notification.dto';
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

export interface SendBookingRequestedNotificationUseCaseResult {
  adminEmailSent: boolean;
  customerEmailSent: boolean;
}

@Injectable()
export class SendBookingRequestedNotificationUseCase extends BaseNotificationUseCase {
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
    dto: SendBookingRequestedNotificationDto,
  ): Promise<SendBookingRequestedNotificationUseCaseResult> {
    const [adminSent, customerSent] = await Promise.all([
      this.isAlreadySent(
        dto.tenantId,
        dto.eventId,
        NotificationTemplateKey.BOOKING_REQUESTED_ADMIN,
        CHANNEL,
      ),
      this.isAlreadySent(
        dto.tenantId,
        dto.eventId,
        NotificationTemplateKey.BOOKING_REQUESTED_CUSTOMER,
        CHANNEL,
      ),
    ]);

    const serviceNames = dto.lines.map((l) => l.serviceNameAtBooking).join(', ');
    const formattedPrice = formatBRL(dto.totalPrice.amount);

    let adminEmailSent = false;
    let customerEmailSent = false;

    if (!adminSent) {
      const managerEmails = await this.staffPort.getManagerEmails(dto.tenantId);
      if (managerEmails.length > 0) {
        await Promise.all(
          managerEmails.map((email) =>
            this.dispatcher.dispatch({
              tenantId: dto.tenantId,
              to: email,
              subject: `Nova solicitação de agendamento — ${serviceNames}`,
              templateKey: NotificationTemplateKey.BOOKING_REQUESTED_ADMIN,
              data: {
                guestName: dto.guestName,
                scheduledAt: dto.scheduledAt,
                serviceNames,
                totalPrice: formattedPrice,
                pickupAddress: dto.pickupAddress,
              },
            }),
          ),
        );
        await this.saveLog(
          dto.tenantId,
          dto.eventId,
          NotificationTemplateKey.BOOKING_REQUESTED_ADMIN,
          CHANNEL,
        );
        adminEmailSent = true;
      }
    }

    if (!customerSent) {
      const tenantInfo = await this.tenantPort.getTenantInfo(dto.tenantId);
      await this.dispatcher.dispatch({
        tenantId: dto.tenantId,
        to: dto.guestEmail,
        subject: 'Seu agendamento foi recebido',
        templateKey: NotificationTemplateKey.BOOKING_REQUESTED_CUSTOMER,
        data: {
          guestName: dto.guestName,
          scheduledAt: dto.scheduledAt,
          serviceNames,
          totalPrice: formattedPrice,
          tenantName: tenantInfo?.name ?? '',
        },
      });
      await this.saveLog(
        dto.tenantId,
        dto.eventId,
        NotificationTemplateKey.BOOKING_REQUESTED_CUSTOMER,
        CHANNEL,
      );
      customerEmailSent = true;
    }

    return { adminEmailSent, customerEmailSent };
  }
}
