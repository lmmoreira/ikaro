import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { NotificationLog } from '../../domain/notification-log.aggregate';
import { NotificationTemplate } from '../../domain/notification-template.aggregate';
import { NOTIFICATION_TEMPLATE_KEY_MAPPING } from '../../domain/notification-template-key.mapping';
import { INotificationDispatcher } from '../ports/notification-dispatcher.port';
import { INotificationLogRepository } from '../ports/notification-log-repository.port';
import { INotificationProcessedEventRepository } from '../ports/processed-event-repository.port';
import { ILocalizationPort } from '../ports/localization.port';

export abstract class BaseNotificationUseCase {
  protected readonly logger = new AppLogger(this.constructor.name);

  constructor(
    protected readonly logRepo: INotificationLogRepository,
    protected readonly processedEventRepo: INotificationProcessedEventRepository,
    protected readonly dispatcher: INotificationDispatcher,
    protected readonly txManager: ITransactionManager,
  ) {}

  protected async isAlreadySent(
    eventId: string,
    notificationType: string,
    channel: string,
  ): Promise<boolean> {
    return this.processedEventRepo.isDuplicate(eventId, notificationType, channel);
  }

  protected async saveLog(
    tenantId: string,
    eventId: string,
    notificationType: string,
    channel: string,
    recipientEmail: string,
  ): Promise<void> {
    const log = NotificationLog.create({
      tenantId,
      eventId,
      notificationType,
      channel,
      recipientEmail,
    });
    log.markSent();
    await this.txManager.run(async () => {
      await this.logRepo.save(log);
      await this.processedEventRepo.markProcessed(eventId, notificationType, channel);
    });
  }

  protected async saveFailedLog(
    tenantId: string,
    eventId: string,
    notificationType: string,
    channel: string,
    recipientEmail: string,
    errorMessage: string,
  ): Promise<void> {
    const log = NotificationLog.create({
      tenantId,
      eventId,
      notificationType,
      channel,
      recipientEmail,
    });
    log.markFailed(errorMessage);
    await this.txManager.run(async () => {
      await this.logRepo.save(log);
    });
  }

  // Overlays each fetched template's subject/body with locale-correct content from
  // ILocalizationPort before render() interpolates variables — the DB row's own subject/body
  // is no longer the content source (TD02-S10), only its triggerEvent/channel/existence matter.
  // eventName/recipientType are derived per template from NOTIFICATION_TEMPLATE_KEY_MAPPING
  // rather than passed in by callers, so that mapping stays the single source of truth.
  protected localizeTemplates(
    templates: NotificationTemplate[],
    localizationPort: ILocalizationPort,
    locale: string,
  ): void {
    for (const template of templates) {
      const mapping = NOTIFICATION_TEMPLATE_KEY_MAPPING[template.triggerEvent];
      if (!mapping) {
        throw new Error(
          `No mapping found for trigger event "${template.triggerEvent}" — check NOTIFICATION_TEMPLATE_KEY_MAPPING`,
        );
      }
      const localized = localizationPort.getNotificationTemplate(
        mapping.eventName,
        mapping.recipientType,
        locale,
      );
      template.update(localized.subject, localized.body);
    }
  }

  protected async dispatchTemplates(
    templates: NotificationTemplate[],
    dto: { tenantId: string; eventId: string },
    to: string,
    variables: Record<string, string>,
  ): Promise<boolean> {
    let sent = false;
    for (const template of templates) {
      if (await this.isAlreadySent(dto.eventId, template.triggerEvent, template.channel)) continue;
      const { subject, body } = template.render(variables);
      try {
        await this.dispatcher.dispatch({
          tenantId: dto.tenantId,
          to,
          subject,
          body,
          channel: template.channel,
          notificationType: template.triggerEvent,
        });
        await this.saveLog(dto.tenantId, dto.eventId, template.triggerEvent, template.channel, to);
        sent = true;
      } catch (err: unknown) {
        await this.saveFailedLog(
          dto.tenantId,
          dto.eventId,
          template.triggerEvent,
          template.channel,
          to,
          String(err),
        );
        throw err;
      }
    }
    return sent;
  }

  protected async dispatchTemplatesToMany(
    templates: NotificationTemplate[],
    dto: { tenantId: string; eventId: string },
    emails: string[],
    variables: Record<string, string>,
  ): Promise<boolean> {
    let sent = false;
    for (const template of templates) {
      if (await this.isAlreadySent(dto.eventId, template.triggerEvent, template.channel)) continue;
      const { subject, body } = template.render(variables);
      try {
        await Promise.all(
          emails.map((email) =>
            this.dispatcher.dispatch({
              tenantId: dto.tenantId,
              to: email,
              subject,
              body,
              channel: template.channel,
              notificationType: template.triggerEvent,
            }),
          ),
        );
        await this.saveLog(
          dto.tenantId,
          dto.eventId,
          template.triggerEvent,
          template.channel,
          emails[0],
        );
        sent = true;
      } catch (err: unknown) {
        await this.saveFailedLog(
          dto.tenantId,
          dto.eventId,
          template.triggerEvent,
          template.channel,
          emails[0],
          String(err),
        );
        throw err;
      }
    }
    return sent;
  }
}
