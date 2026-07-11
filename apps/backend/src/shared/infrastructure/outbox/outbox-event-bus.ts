import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainEvent } from '../../domain/domain-event';
import { AppLogger } from '../../observability/app-logger';
import { IEventBus } from '../../ports/event-bus.port';
import { IPushableEventBus } from '../../ports/pushable-event-bus.port';
import { ITriggerBus } from '../../ports/trigger-bus.port';
import { getActiveEntityManager, scheduleAfterCommit } from '../transaction-context';
import { GcpPubSubEventBusAdapter } from '../gcp-pubsub-event-bus.adapter';
import { OutboxEventEntity } from './outbox-event.entity';
import { OutboxRelayService } from './outbox-relay.service';

const INSERT_SQL = `
  INSERT INTO "shared"."outbox"
    ("id","dedup_key","tenant_id","event_name","payload","created_at")
  VALUES ($1,$2,$3,$4,$5,now())
  ON CONFLICT ("dedup_key") DO NOTHING
  RETURNING "id"
`;

interface OutboxInsertRow {
  id: string;
}

// Bound as EVENT_BUS starting TD24-S02 — until then this class is built and unit/integration
// tested in isolation (TD24-S01 "ships dark"), never resolved via Nest DI.
@Injectable()
export class OutboxEventBus implements IEventBus, ITriggerBus, IPushableEventBus {
  private readonly logger = new AppLogger(OutboxEventBus.name);

  constructor(
    @InjectRepository(OutboxEventEntity)
    private readonly repo: Repository<OutboxEventEntity>,
    private readonly innerBus: GcpPubSubEventBusAdapter,
    private readonly relay: OutboxRelayService,
    private readonly config: ConfigService,
  ) {}

  async publish(event: DomainEvent): Promise<void> {
    const dedupKey = event.dedupKey ?? event.eventId;
    const params = [
      event.eventId,
      dedupKey,
      event.tenantId,
      event.eventName,
      JSON.stringify(event),
    ];

    const manager = getActiveEntityManager();
    const rows = manager
      ? ((await manager.query(INSERT_SQL, params)) as OutboxInsertRow[])
      : ((await this.repo.query(INSERT_SQL, params)) as OutboxInsertRow[]);

    // Conflicting insert (duplicate dedup_key) — no row, no dispatch. The first writer owns
    // delivery; this is what makes a cron double-run or a same-eventId republish a no-op here.
    if (rows.length === 0) return;

    const insertedId = rows[0].id;

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

  subscribe<T extends DomainEvent>(
    eventName: string,
    handler: (event: T) => Promise<void>,
    consumerName: string,
  ): void {
    this.innerBus.subscribe(eventName, handler, consumerName);
  }

  registerTrigger(name: string, handler: () => Promise<void>, consumerName: string): void {
    this.innerBus.registerTrigger(name, handler, consumerName);
  }

  async publishTrigger(name: string): Promise<void> {
    await this.innerBus.publishTrigger(name);
  }

  async dispatchPushMessage(subscriptionFullName: string, base64Data: string): Promise<void> {
    await this.innerBus.dispatchPushMessage(subscriptionFullName, base64Data);
  }
}
