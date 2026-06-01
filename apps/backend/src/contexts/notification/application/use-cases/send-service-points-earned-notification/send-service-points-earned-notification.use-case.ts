import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendServicePointsEarnedNotificationDto } from '../../dtos/send-service-points-earned-notification.dto';
import {
  INotificationCustomerPort,
  NOTIFICATION_CUSTOMER_PORT,
} from '../../ports/notification-customer.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../../ports/notification-dispatcher.port';
import {
  INotificationLogRepository,
  NOTIFICATION_LOG_REPOSITORY,
} from '../../ports/notification-log-repository.port';
import {
  INotificationServicePort,
  NOTIFICATION_SERVICE_PORT,
} from '../../ports/notification-service.port';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const CHANNEL = 'EMAIL';

export interface SendServicePointsEarnedNotificationUseCaseResult {
  emailSent: boolean;
}

@Injectable()
export class SendServicePointsEarnedNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_CUSTOMER_PORT) private readonly customerPort: INotificationCustomerPort,
    @Inject(NOTIFICATION_SERVICE_PORT) private readonly servicePort: INotificationServicePort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
  ) {
    super(logRepo, dispatcher, txManager);
  }

  async execute(
    dto: SendServicePointsEarnedNotificationDto,
  ): Promise<SendServicePointsEarnedNotificationUseCaseResult> {
    if (
      await this.isAlreadySent(
        dto.tenantId,
        dto.eventId,
        NotificationTemplateKey.SERVICE_POINTS_EARNED,
        CHANNEL,
      )
    ) {
      return { emailSent: false };
    }

    const customer = await this.customerPort.getCustomerInfo(dto.customerId, dto.tenantId);
    if (!customer) return { emailSent: false };

    const serviceIds = dto.lines.map((l) => l.serviceId);
    const serviceInfos = await this.servicePort.findServicesByIds(dto.tenantId, serviceIds);
    const nameById = new Map(serviceInfos.map((s) => [s.serviceId, s.serviceName]));

    const services = dto.lines.map((l) => ({
      serviceName: nameById.get(l.serviceId) ?? l.serviceId,
      pointsEarned: l.pointsEarned,
      expiresAt: l.expiresAt,
    }));

    await this.dispatcher.dispatch({
      tenantId: dto.tenantId,
      to: customer.email,
      subject: `Lavagem concluída! Você ganhou ${dto.totalPointsEarned} pontos`,
      templateKey: NotificationTemplateKey.SERVICE_POINTS_EARNED,
      data: {
        customerName: customer.name,
        totalPointsEarned: dto.totalPointsEarned,
        services,
        currentBalance: dto.currentBalance,
      },
    });

    await this.saveLog(
      dto.tenantId,
      dto.eventId,
      NotificationTemplateKey.SERVICE_POINTS_EARNED,
      CHANNEL,
    );
    return { emailSent: true };
  }
}
