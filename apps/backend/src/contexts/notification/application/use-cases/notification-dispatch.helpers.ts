import { NotificationTemplate } from '../../domain/notification-template.aggregate';
import { INotificationDispatcher } from '../ports/notification-dispatcher.port';
import { IInboxRepository } from '../../../../shared/ports/inbox.port';

export interface DispatchAttemptDeps {
  dispatcher: INotificationDispatcher;
  inboxRepo: IInboxRepository;
  saveFailedLog: (
    tenantId: string,
    eventId: string,
    notificationType: string,
    channel: string,
    recipientEmail: string,
    errorMessage: string,
    correlationId: string,
  ) => Promise<void>;
}

// TD24-S04: notification's old (event_id, notification_type, channel) granularity is preserved
// by composing the two into one consumer_name string — shared.inbox has a single consumer_name
// column, not three. AUD-004 item 3: a recipient can be appended for the multi-recipient path, so
// each (template, recipient) pair claims/retries independently instead of the whole batch.
export function buildConsumerName(
  notificationType: string,
  channel: string,
  recipient?: string,
): string {
  const base = `${notificationType}:${channel}`;
  return recipient ? `${base}:${recipient}` : base;
}

/** Dispatches via the transport, unclaiming and logging the failure on error rather than throwing directly. */
export async function attemptDispatch(
  deps: DispatchAttemptDeps,
  template: NotificationTemplate,
  dto: { tenantId: string; eventId: string; correlationId: string },
  to: string,
  subject: string,
  body: string,
  consumerName: string,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    await deps.dispatcher.dispatch({
      tenantId: dto.tenantId,
      to,
      subject,
      body,
      channel: template.channel,
      notificationType: template.triggerEvent,
    });
    return { ok: true };
  } catch (err: unknown) {
    await deps.inboxRepo.unclaim(dto.eventId, consumerName);
    await deps.saveFailedLog(
      dto.tenantId,
      dto.eventId,
      template.triggerEvent,
      template.channel,
      to,
      String(err),
      dto.correlationId,
    );
    return { ok: false, error: err };
  }
}

export function throwIfAnyFailed(errors: unknown[]): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(
      errors,
      `${errors.length} recipient(s) failed to receive notification`,
    );
  }
}
