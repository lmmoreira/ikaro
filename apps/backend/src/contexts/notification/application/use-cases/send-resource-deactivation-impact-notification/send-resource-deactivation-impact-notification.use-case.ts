import { Inject, Injectable } from '@nestjs/common';
import { escapeHtml } from '../../../../../shared/utils/escape-html';
import {
  APPLICATION_CONFIG,
  IApplicationConfig,
} from '../../../../../shared/ports/application-config.port';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../../shared/ports/inbox.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { DEFAULT_LOCALE } from '../../../domain/notification-locale.constants';
import { TemplateVariables } from '../../../domain/notification-template-key.mapping';
import { BaseNotificationDto } from '../../dtos/base-notification.dto';
import { ILocalizationPort, LOCALIZATION_PORT } from '../../ports/localization.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../../ports/notification-dispatcher.port';
import {
  INotificationLogRepository,
  NOTIFICATION_LOG_REPOSITORY,
} from '../../ports/notification-log-repository.port';
import {
  INotificationPlatformPort,
  NOTIFICATION_PLATFORM_PORT,
} from '../../ports/notification-platform.port';
import {
  INotificationStaffPort,
  NOTIFICATION_STAFF_PORT,
} from '../../ports/notification-staff.port';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../ports/notification-template-repository.port';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const TRIGGER = NotificationTemplateKey.RESOURCE_DEACTIVATION_IMPACT_ADMIN;

export interface SendResourceDeactivationImpactNotificationUseCaseInput extends BaseNotificationDto {
  resourceName: string;
  affectedCount: number;
}

export interface SendResourceDeactivationImpactNotificationUseCaseResult {
  adminEmailSent: boolean;
}

// M23-S23 — one email to every manager per resource deactivation, not one per affected booking.
// The link goes to the dashboard root: the worklist page (M23-S14) does not exist yet.
@Injectable()
export class SendResourceDeactivationImpactNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(INBOX_REPOSITORY) inboxRepo: IInboxRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_STAFF_PORT) private readonly staffPort: INotificationStaffPort,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
    @Inject(LOCALIZATION_PORT) private readonly localizationPort: ILocalizationPort,
    @Inject(APPLICATION_CONFIG) private readonly config: IApplicationConfig,
  ) {
    super(logRepo, inboxRepo, dispatcher, txManager);
  }

  async execute(
    input: SendResourceDeactivationImpactNotificationUseCaseInput,
  ): Promise<SendResourceDeactivationImpactNotificationUseCaseResult> {
    const templates = await this.templateRepo.findAllByTriggerEvent(input.tenantId, TRIGGER);
    if (templates.length === 0) {
      this.logger.warn('No template found — skipping', {
        tenantId: input.tenantId,
        triggerEvent: TRIGGER,
      });
      return { adminEmailSent: false };
    }

    const managerEmails = await this.staffPort.getManagerEmails(input.tenantId);
    if (managerEmails.length === 0) return { adminEmailSent: false };

    const tenantInfo = await this.tenantPort.getTenantInfo(input.tenantId);
    this.localizeTemplates(templates, this.localizationPort, tenantInfo?.locale ?? DEFAULT_LOCALE);

    const variables: TemplateVariables<typeof TRIGGER> = {
      resourceName: escapeHtml(input.resourceName),
      affectedCount: String(input.affectedCount),
      dashboardLink: escapeHtml(`${this.config.getOrThrow('FRONTEND_URL')}/dashboard`),
    };
    const adminEmailSent = await this.dispatchTemplatesToMany(
      templates,
      input,
      managerEmails,
      variables,
    );
    return { adminEmailSent };
  }
}
