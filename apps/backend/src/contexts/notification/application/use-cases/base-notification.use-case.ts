import { AppLogger } from '../../../../shared/observability/app-logger';
import { IInboxRepository } from '../../../../shared/ports/inbox.port';
import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { NotificationLog } from '../../domain/notification-log.aggregate';
import { NotificationTemplate } from '../../domain/notification-template.aggregate';
import { NOTIFICATION_TEMPLATE_KEY_MAPPING } from '../../domain/notification-template-key.mapping';
import { INotificationDispatcher } from '../ports/notification-dispatcher.port';
import { INotificationLogRepository } from '../ports/notification-log-repository.port';
import { ILocalizationPort } from '../ports/localization.port';

export abstract class BaseNotificationUseCase {
  protected readonly logger = new AppLogger(this.constructor.name);

  constructor(
    protected readonly logRepo: INotificationLogRepository,
    protected readonly inboxRepo: IInboxRepository,
    protected readonly dispatcher: INotificationDispatcher,
    protected readonly txManager: ITransactionManager,
  ) {}

  // TD24-S04: notification's old (event_id, notification_type, channel) granularity is preserved
  // by composing the two into one consumer_name string — shared.inbox has a single consumer_name
  // column, not three.
  private consumerName(notificationType: string, channel: string): string {
    return `${notificationType}:${channel}`;
  }

  protected async isAlreadySent(
    eventId: string,
    notificationType: string,
    channel: string,
  ): Promise<boolean> {
    return this.inboxRepo.hasBeenProcessed(eventId, this.consumerName(notificationType, channel));
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
      await this.inboxRepo.markProcessed(eventId, this.consumerName(notificationType, channel));
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
