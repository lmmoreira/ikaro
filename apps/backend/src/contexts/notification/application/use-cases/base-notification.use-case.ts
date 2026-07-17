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
  // column, not three. AUD-004 item 3: a recipient can be appended for the multi-recipient path,
  // so each (template, recipient) pair claims/retries independently instead of the whole batch.
  private consumerName(notificationType: string, channel: string, recipient?: string): string {
    const base = `${notificationType}:${channel}`;
    return recipient ? `${base}:${recipient}` : base;
  }

  protected async saveLog(
    tenantId: string,
    eventId: string,
    notificationType: string,
    channel: string,
    recipientEmail: string,
    consumerName: string,
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
      // consumerName is the caller's exact tryClaim key (recipient-scoped for
      // dispatchTemplatesToMany) — redundant with tryClaim (the row already exists), kept as an
      // upsert so the audit log and the final processed_at both land in the same transaction, and
      // harmless if it ever runs standalone. Must match tryClaim's key exactly, or this marks a
      // different, stray inbox row instead of the one actually claimed.
      await this.inboxRepo.markProcessed(eventId, consumerName);
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
      const consumerName = this.consumerName(template.triggerEvent, template.channel);
      if (!(await this.inboxRepo.tryClaim(dto.eventId, consumerName))) continue;
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
        await this.saveLog(
          dto.tenantId,
          dto.eventId,
          template.triggerEvent,
          template.channel,
          to,
          consumerName,
        );
        sent = true;
      } catch (err: unknown) {
        await this.inboxRepo.unclaim(dto.eventId, consumerName);
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

  // AUD-004 item 3: claims one inbox row per (eventId, notificationType:channel:recipient)
  // instead of one per (eventId, notificationType:channel) guarding the whole batch — a recipient
  // whose dispatch already succeeded is a cheap tryClaim-false skip on redelivery, so a retry
  // only re-sends to the recipient(s) that actually failed. Dispatch is sequential (these are
  // small staff/manager lists, not customer broadcast) and continue-on-error: every recipient is
  // attempted in this pass, and one failure doesn't block the rest from receiving their email now
  // — a single error is thrown at the end (to nack for Pub/Sub redelivery) only if any failed.
  protected async dispatchTemplatesToMany(
    templates: NotificationTemplate[],
    dto: { tenantId: string; eventId: string },
    emails: string[],
    variables: Record<string, string>,
  ): Promise<boolean> {
    let sent = false;
    const errors: unknown[] = [];

    for (const template of templates) {
      const { subject, body } = template.render(variables);
      for (const email of emails) {
        const consumerName = this.consumerName(template.triggerEvent, template.channel, email);
        if (!(await this.inboxRepo.tryClaim(dto.eventId, consumerName))) continue;
        try {
          await this.dispatcher.dispatch({
            tenantId: dto.tenantId,
            to: email,
            subject,
            body,
            channel: template.channel,
            notificationType: template.triggerEvent,
          });
          await this.saveLog(
            dto.tenantId,
            dto.eventId,
            template.triggerEvent,
            template.channel,
            email,
            consumerName,
          );
          sent = true;
        } catch (err: unknown) {
          await this.inboxRepo.unclaim(dto.eventId, consumerName);
          await this.saveFailedLog(
            dto.tenantId,
            dto.eventId,
            template.triggerEvent,
            template.channel,
            email,
            String(err),
          );
          errors.push(err);
        }
      }
    }

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(
        errors,
        `${errors.length} recipient(s) failed to receive notification`,
      );
    }

    return sent;
  }
}
