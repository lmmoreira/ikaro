// Programmer-error class, not a domain error — no mapXxxError branch needed. TD24-S03: once
// every call site (the 3 event-emitting aggregates' repositories, the 3 cron jobs, and the
// loyalty re-emit) always wraps OutboxPublisher.publish() in txManager.run(), a call arriving
// with no ambient transaction signals a future call site forgot to wrap itself — not a case to
// silently support with a standalone-commit fallback (see td/TD24-OUTBOX-INBOX-PATTERN.md, S03).
export class OutboxPublishedOutsideTransactionError extends Error {
  constructor(eventName: string) {
    super(
      `Outbox publish for "${eventName}" has no ambient transaction — every publish site must ` +
        'run inside txManager.run().',
    );
    this.name = 'OutboxPublishedOutsideTransactionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
