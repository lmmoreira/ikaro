import { Inject, Injectable } from '@nestjs/common';
import { formatBRL } from '../../../../../shared/utils/money-format';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { NotificationLog } from '../../../domain/notification-log.entity';
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

const ADMIN_NOTIFICATION_TYPE = 'BOOKING_REQUESTED_ADMIN';
const CUSTOMER_NOTIFICATION_TYPE = 'BOOKING_REQUESTED_CUSTOMER';
const CHANNEL = 'EMAIL';

export interface SendBookingRequestedNotificationUseCaseResult {
  adminEmailSent: boolean;
  customerEmailSent: boolean;
}

@Injectable()
export class SendBookingRequestedNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY)
    private readonly logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_DISPATCHER)
    private readonly dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_STAFF_PORT)
    private readonly staffPort: INotificationStaffPort,
    @Inject(NOTIFICATION_TENANT_PORT)
    private readonly tenantPort: INotificationTenantPort,
    @Inject(TRANSACTION_MANAGER)
    private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    dto: SendBookingRequestedNotificationDto,
  ): Promise<SendBookingRequestedNotificationUseCaseResult> {
    const [existingAdmin, existingCustomer] = await Promise.all([
      this.logRepo.findByEventAndChannel(
        dto.tenantId,
        dto.eventId,
        ADMIN_NOTIFICATION_TYPE,
        CHANNEL,
      ),
      this.logRepo.findByEventAndChannel(
        dto.tenantId,
        dto.eventId,
        CUSTOMER_NOTIFICATION_TYPE,
        CHANNEL,
      ),
    ]);

    const serviceNames = dto.lines.map((l) => l.serviceNameAtBooking).join(', ');
    const formattedPrice = formatBRL(dto.totalPrice.amount);

    let adminEmailSent = false;
    let customerEmailSent = false;

    if (!existingAdmin) {
      const managerEmails = await this.staffPort.getManagerEmails(dto.tenantId);
      if (managerEmails.length > 0) {
        await Promise.all(
          managerEmails.map((email) =>
            this.dispatcher.dispatch({
              tenantId: dto.tenantId,
              to: email,
              subject: `Nova solicitação de agendamento — ${serviceNames}`,
              templateKey: 'booking-requested-admin',
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
        const adminLog = NotificationLog.create({
          tenantId: dto.tenantId,
          eventId: dto.eventId,
          notificationType: ADMIN_NOTIFICATION_TYPE,
          channel: CHANNEL,
        });
        await this.txManager.run(async () => {
          await this.logRepo.save(adminLog);
        });
        adminEmailSent = true;
      }
    }

    if (!existingCustomer) {
      const tenantInfo = await this.tenantPort.getTenantInfo(dto.tenantId);
      await this.dispatcher.dispatch({
        tenantId: dto.tenantId,
        to: dto.guestEmail,
        subject: 'Seu agendamento foi recebido',
        templateKey: 'booking-requested-customer',
        data: {
          guestName: dto.guestName,
          scheduledAt: dto.scheduledAt,
          serviceNames,
          totalPrice: formattedPrice,
          tenantName: tenantInfo?.name ?? '',
        },
      });
      const customerLog = NotificationLog.create({
        tenantId: dto.tenantId,
        eventId: dto.eventId,
        notificationType: CUSTOMER_NOTIFICATION_TYPE,
        channel: CHANNEL,
      });
      await this.txManager.run(async () => {
        await this.logRepo.save(customerLog);
      });
      customerEmailSent = true;
    }

    return { adminEmailSent, customerEmailSent };
  }
}
