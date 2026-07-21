import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { defaultTracingPort, ITracingPort } from '@ikaro/observability';
import { Command } from '../../domain/command';
import { Envelope } from '../../domain/envelope';
import { AppLogger } from '../../observability/app-logger';
import { IOutboxPublisher } from '../../ports/outbox-publisher.port';
import { IOutboxRepository, OUTBOX_REPOSITORY } from '../../ports/outbox-repository.port';
import { scheduleAfterCommit } from '../transaction-context';
import { OutboxRelayService } from './outbox-relay.service';

// Publish-only — this class has nothing to do with subscribing, triggers, or push dispatch (see
// IOutboxPublisher), and nothing to do with SQL/persistence (see IOutboxRepository — all of that
// lives in TypeOrmOutboxRepository). Bound as EVENT_BUS's publish side starting TD24-S02, once the
// publish/subscribe token split lands (see td/TD24-OUTBOX-INBOX-PATTERN.md §C2/S02) — until then
// this class is built and unit/integration tested in isolation (TD24-S01 "ships dark"), never
// resolved via Nest DI.
@Injectable()
export class OutboxPublisher implements IOutboxPublisher {
  private readonly logger = new AppLogger(OutboxPublisher.name);

  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly outboxRepo: IOutboxRepository,
    private readonly relay: OutboxRelayService,
    private readonly config: ConfigService,
    // @Optional() so Nest's DI container doesn't throw trying to resolve an interface token when
    // no provider is bound for it — falls through to the default, same pattern as
    // CorrelationMiddleware (apps/backend/src/shared/request/correlation.middleware.ts).
    @Optional() private readonly tracingPort: ITracingPort = defaultTracingPort,
  ) {}

  async publish(event: Envelope): Promise<void> {
    // Captured once, here — the single entry point every event passes through before reaching
    // shared.outbox, whether drained from an aggregate (drainDomainEvents()) or published
    // directly by a cron job/consumer re-emit. Whatever trace is active *now* (the original
    // business request, for the common case) is what a consumer's span should link to — not
    // whatever's active later, at actual-publish time, which for a swept row would be the
    // sweep's own trace instead (TD28). Rides into the outbox's jsonb payload column for free.
    const carrier: Record<string, string> = {};
    this.tracingPort.injectContext(carrier);
    event.traceContext = carrier;

    // Command carries its own deterministic dedupKey (required on that type); every other
    // Envelope (a DomainEvent, a real fact) is only ever constructed once per business action,
    // so its own eventId already identifies that fact uniquely.
    const dedupKey = event instanceof Command ? event.dedupKey : event.eventId;
    const insertedId = await this.outboxRepo.insert(event, dedupKey);

    // Conflicting insert (duplicate dedup_key) — no row, no dispatch. The first writer owns
    // delivery; this is what makes a cron double-run or a same-eventId republish a no-op here.
    if (!insertedId) return;

    if (!this.config.get<boolean>('OUTBOX_INLINE_DISPATCH_ENABLED', true)) return;

    // Scheduled after commit — runs before the HTTP response returns (§C1: after-commit callbacks
    // are awaited inside txManager.run(), not backgrounded). Awaiting here (not fire-and-forget)
    // is deliberate: Cloud Run throttles CPU once the response is sent, so a floating promise
    // would get starved and every "happy path" would silently degrade to sweep latency.
    //
    // The try/catch below is mandatory, not defensive style: flushAfterCommitCallbacks has no
    // try/catch of its own — an escaping error here would propagate out of txManager.run() AFTER
    // the commit already happened (reporting failure for work that succeeded) and would abort
    // every other callback still queued in the same transaction.
    await scheduleAfterCommit(async () => {
      try {
        await this.relay.relay([insertedId]);
      } catch (err) {
        this.logger.error(
          '[outbox] inline dispatch failed unexpectedly — row stays unpublished for the sweep to retry',
          err instanceof Error ? err.stack : String(err),
          { outboxRowId: insertedId, eventName: event.eventName },
        );
      }
    });
  }
}
