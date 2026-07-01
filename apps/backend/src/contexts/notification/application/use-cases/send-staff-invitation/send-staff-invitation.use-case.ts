import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
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
  INotificationProcessedEventRepository,
  NOTIFICATION_PROCESSED_EVENT_REPOSITORY,
} from '../../ports/processed-event-repository.port';
import {
  INotificationStaffPort,
  NOTIFICATION_STAFF_PORT,
} from '../../ports/notification-staff.port';
import {
  INotificationPlatformPort,
  NOTIFICATION_PLATFORM_PORT,
} from '../../ports/notification-platform.port';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../ports/notification-template-repository.port';
import { ILocalizationPort, LOCALIZATION_PORT } from '../../ports/localization.port';
import { DEFAULT_LOCALE } from '../../../domain/notification-locale.constants';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const TRIGGER = NotificationTemplateKey.STAFF_INVITATION;

export type SendStaffInvitationUseCaseInput = SendStaffInvitationDto;

export interface SendStaffInvitationUseCaseResult {
  sent: boolean;
}

@Injectable()
export class SendStaffInvitationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_PROCESSED_EVENT_REPOSITORY)
    processedEventRepo: INotificationProcessedEventRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_STAFF_PORT) private readonly staffPort: INotificationStaffPort,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(LOCALIZATION_PORT) private readonly localizationPort: ILocalizationPort,
    private readonly config: ConfigService,
  ) {
    super(logRepo, processedEventRepo, dispatcher, txManager);
  }

  async execute(input: SendStaffInvitationUseCaseInput): Promise<SendStaffInvitationUseCaseResult> {
    const templates = await this.templateRepo.findAllByTriggerEvent(input.tenantId, TRIGGER);
    if (templates.length === 0) {
      this.logger.warn('No template found — skipping', {
        tenantId: input.tenantId,
        triggerEvent: TRIGGER,
      });
      return { sent: false };
    }

    const [staff, tenant] = await Promise.all([
      this.staffPort.getStaffInfo(input.staffId, input.tenantId),
      this.tenantPort.getTenantInfo(input.tenantId),
    ]);
    if (!staff || !tenant) return { sent: false };

    this.localizeTemplates(templates, this.localizationPort, tenant.locale ?? DEFAULT_LOCALE);

    const activationLink = `${this.config.getOrThrow<string>('FRONTEND_URL')}/${tenant.slug}/auth/staff`;

    const sent = await this.dispatchTemplates(templates, input, staff.email, {
      staffName: staff.name ?? staff.email,
      tenantName: tenant.name,
      activationLink,
    });
    return { sent };
  }
}
