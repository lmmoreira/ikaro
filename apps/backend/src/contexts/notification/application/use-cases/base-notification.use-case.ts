import { AppLogger } from '../../../../shared/observability/app-logger';
import { IInboxRepository } from '../../../../shared/ports/inbox.port';
import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { redactEmailForLogging } from '../../../../shared/utils/redact-email-for-logging';
import { NotificationLog } from '../../domain/notification-log.aggregate';
import { NotificationTemplate } from '../../domain/notification-template.aggregate';
import { NOTIFICATION_TEMPLATE_KEY_MAPPING } from '../../domain/notification-template-key.mapping';
import { INotificationDispatcher } from '../ports/notification-dispatcher.port';
import { INotificationLogRepository } from '../ports/notification-log-repository.port';
import { ILocalizationPort } from '../ports/localization.port';
import {
  attemptDispatch,
  buildConsumerName,
  throwIfAnyFailed,
  DispatchAttemptDeps,
} from './notification-dispatch.helpers';

export abstract class BaseNotificationUseCase {
  protected readonly logger = new AppLogger(this.constructor.name);

  constructor(
    protected readonly logRepo: INotificationLogRepository,
    protected readonly inboxRepo: IInboxRepository,
    protected readonly dispatcher: INotificationDispatcher,
    protected readonly txManager: ITransactionManager,
  ) {}

  private get dispatchDeps(): DispatchAttemptDeps {
    return {
      dispatcher: this.dispatcher,
      inboxRepo: this.inboxRepo,
      saveFailedLog: this.saveFailedLog.bind(this),
    };
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
    correlationId: string,
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
    this.logger.warn('Notification failed', {
      tenantId,
      correlationId,
      notificationType,
      channel,
      // Redacted, not the raw errorMessage: this string is arbitrary upstream
      // dispatcher/SMTP text (e.g. "550 mailbox not found: <email>") that can carry the
      // recipient's email address into a broadly searchable log stream. The full,
      // unredacted message is still preserved in NotificationLog.errorMessage (log.markFailed()
      // above) — this log line trades a small amount of debug detail for not duplicating that
      // PII into Cloud Logging (cross-tool review finding, PR #359, 2026-08-12).
      errorMessage: redactEmailForLogging(errorMessage),
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
    dto: { tenantId: string; eventId: string; correlationId: string },
    to: string,
    variables: Record<string, string>,
  ): Promise<boolean> {
    let sent = false;
    for (const template of templates) {
      if (await this.dispatchOneTemplate(template, dto, to, variables)) sent = true;
    }
    return sent;
  }

  private async dispatchOneTemplate(
    template: NotificationTemplate,
    dto: { tenantId: string; eventId: string; correlationId: string },
    to: string,
    variables: Record<string, string>,
  ): Promise<boolean> {
    const consumerName = buildConsumerName(template.triggerEvent, template.channel);
    if (!(await this.inboxRepo.tryClaim(dto.eventId, consumerName))) return false;
    const { subject, body } = template.render(variables);
    const result = await attemptDispatch(
      this.dispatchDeps,
      template,
      dto,
      to,
      subject,
      body,
      consumerName,
    );
    if (!result.ok) throw result.error;
    // Dispatch succeeded — the email is already sent. A persistence failure here must NOT
    // unclaim: unclaiming would let a redelivery dispatch a real duplicate send for a message
    // that already went out. Losing this one audit-log row is the accepted, lesser cost.
    await this.saveLog(
      dto.tenantId,
      dto.eventId,
      template.triggerEvent,
      template.channel,
      to,
      consumerName,
    );
    return true;
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
    dto: { tenantId: string; eventId: string; correlationId: string },
    emails: string[],
    variables: Record<string, string>,
  ): Promise<boolean> {
    let sent = false;
    const errors: unknown[] = [];

    for (const template of templates) {
      const { subject, body } = template.render(variables);
      for (const email of emails) {
        if (await this.dispatchToOneRecipient(template, dto, email, subject, body, errors)) {
          sent = true;
        }
      }
    }

    throwIfAnyFailed(errors);
    return sent;
  }

  private async dispatchToOneRecipient(
    template: NotificationTemplate,
    dto: { tenantId: string; eventId: string; correlationId: string },
    email: string,
    subject: string,
    body: string,
    errors: unknown[],
  ): Promise<boolean> {
    const consumerName = buildConsumerName(template.triggerEvent, template.channel, email);
    if (!(await this.inboxRepo.tryClaim(dto.eventId, consumerName))) return false;
    const result = await attemptDispatch(
      this.dispatchDeps,
      template,
      dto,
      email,
      subject,
      body,
      consumerName,
    );
    if (!result.ok) {
      errors.push(result.error);
      return false;
    }
    // Dispatch succeeded — the email is already sent. A persistence failure here must NOT
    // unclaim: unclaiming would let a redelivery dispatch a real duplicate send for a message
    // that already went out. Still collected as an error (so the event nacks/retries overall),
    // but this recipient's claim stays in place — losing this one audit-log row is the
    // accepted, lesser cost.
    try {
      await this.saveLog(
        dto.tenantId,
        dto.eventId,
        template.triggerEvent,
        template.channel,
        email,
        consumerName,
      );
    } catch (err: unknown) {
      errors.push(err);
    }
    return true;
  }
}
