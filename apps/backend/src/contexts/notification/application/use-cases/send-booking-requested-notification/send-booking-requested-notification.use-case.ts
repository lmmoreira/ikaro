import { Inject, Injectable } from '@nestjs/common';
import { formatBRL } from '../../../../../shared/utils/money-format';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
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
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../ports/notification-template-repository.port';
import { BaseNotificationUseCase } from '../base-notification.use-case';

export interface SendBookingRequestedNotificationUseCaseResult {
  adminEmailSent: boolean;
  customerEmailSent: boolean;
}

@Injectable()
export class SendBookingRequestedNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_PROCESSED_EVENT_REPOSITORY)
    processedEventRepo: INotificationProcessedEventRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_STAFF_PORT) private readonly staffPort: INotificationStaffPort,
    @Inject(NOTIFICATION_TENANT_PORT) private readonly tenantPort: INotificationTenantPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
  ) {
    super(logRepo, processedEventRepo, dispatcher, txManager);
  }

  async execute(
    dto: SendBookingRequestedNotificationDto,
  ): Promise<SendBookingRequestedNotificationUseCaseResult> {
    const serviceNames = dto.lines.map((l) => l.serviceNameAtBooking).join(', ');
    const formattedPrice = formatBRL(dto.totalPrice.amount);

    const [adminTemplates, customerTemplates, managerEmails, tenantInfo] = await Promise.all([
      this.templateRepo.findAllByTriggerEvent(
        dto.tenantId,
        NotificationTemplateKey.BOOKING_REQUESTED_ADMIN,
      ),
      this.templateRepo.findAllByTriggerEvent(
        dto.tenantId,
        NotificationTemplateKey.BOOKING_REQUESTED_CUSTOMER,
      ),
      this.staffPort.getManagerEmails(dto.tenantId),
      this.tenantPort.getTenantInfo(dto.tenantId),
    ]);

    const variables: Record<string, string> = {
      contactName: dto.contactName,
      scheduledAt: dto.scheduledAt,
      serviceNames,
      totalPrice: formattedPrice,
      pickupAddress: dto.pickupAddress ? JSON.stringify(dto.pickupAddress) : '',
      tenantName: tenantInfo?.name ?? '',
    };

    const adminEmailSent =
      managerEmails.length > 0
        ? await this.dispatchTemplatesToMany(adminTemplates, dto, managerEmails, variables)
        : false;

    const customerEmailSent = await this.dispatchTemplates(
      customerTemplates,
      dto,
      dto.contactEmail,
      variables,
    );

    return { adminEmailSent, customerEmailSent };
  }
}
