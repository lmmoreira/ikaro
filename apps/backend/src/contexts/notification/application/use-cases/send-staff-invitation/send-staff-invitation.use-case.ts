import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendStaffInvitationDto } from '../../dtos/send-staff-invitation.dto';
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
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const CHANNEL = 'EMAIL';

export interface SendStaffInvitationUseCaseResult {
  sent: boolean;
}

@Injectable()
export class SendStaffInvitationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_STAFF_PORT) private readonly staffPort: INotificationStaffPort,
    @Inject(NOTIFICATION_TENANT_PORT) private readonly tenantPort: INotificationTenantPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    private readonly config: ConfigService,
  ) {
    super(logRepo, dispatcher, txManager);
  }

  async execute(dto: SendStaffInvitationDto): Promise<SendStaffInvitationUseCaseResult> {
    if (
      await this.isAlreadySent(
        dto.tenantId,
        dto.eventId,
        NotificationTemplateKey.STAFF_INVITATION,
        CHANNEL,
      )
    ) {
      return { sent: false };
    }

    const [staff, tenant] = await Promise.all([
      this.staffPort.getStaffInfo(dto.staffId, dto.tenantId),
      this.tenantPort.getTenantInfo(dto.tenantId),
    ]);

    if (!staff || !tenant) return { sent: false };

    await this.dispatcher.dispatch({
      tenantId: dto.tenantId,
      to: staff.email,
      subject: `Você foi convidado para a equipe ${tenant.name}`,
      templateKey: NotificationTemplateKey.STAFF_INVITATION,
      data: {
        staffName: staff.name ?? staff.email,
        tenantName: tenant.name,
        activationLink: `${this.config.getOrThrow<string>('FRONTEND_URL')}/${tenant.slug}/auth/staff`,
      },
    });

    await this.saveLog(
      dto.tenantId,
      dto.eventId,
      NotificationTemplateKey.STAFF_INVITATION,
      CHANNEL,
    );
    return { sent: true };
  }
}
