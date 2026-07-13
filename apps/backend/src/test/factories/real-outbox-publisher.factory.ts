import { IEventBus } from '../../shared/ports/event-bus.port';
import { IInboxRepository } from '../../shared/ports/inbox.port';
import { IOutboxPublisher } from '../../shared/ports/outbox-publisher.port';
import { IOutboxRepository } from '../../shared/ports/outbox-repository.port';
import { OutboxPublisher } from '../../shared/infrastructure/outbox/outbox-publisher';
import { OutboxRelayService } from '../../shared/infrastructure/outbox/outbox-relay.service';
import { makeConfigService } from '../infrastructure/fake-config-service';
import { InMemoryInboxRepository } from '../infrastructure/in-memory-inbox.repository';

// Shared factory for the 3 cron-job integration specs (TD24-S03, bad-smell-audit BE-3) that each
// independently hand-rolled a real OutboxPublisher wired to a real IOutboxRepository — inline
// dispatch defaults to disabled so tests control exactly when the relay runs, via an explicit
// relay.relay([rowId]) call rather than racing the after-commit callback. The relay's constructor
// also needs an IInboxRepository (TD24-S04, GC only) — these callers only ever exercise the
// explicit-rowIds path (never relay()'s no-args sweep+GC path), so a plain in-memory double is
// enough; nothing here ever calls its methods for real.
export function makeRealOutboxPublisher(
  outboxRepo: IOutboxRepository,
  eventBus: IEventBus,
  inlineDispatchEnabled = false,
  inboxRepo: IInboxRepository = new InMemoryInboxRepository(),
): IOutboxPublisher {
  const config = makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: inlineDispatchEnabled });
  const relay = new OutboxRelayService(outboxRepo, eventBus, inboxRepo, config);
  return new OutboxPublisher(outboxRepo, relay, config);
}
