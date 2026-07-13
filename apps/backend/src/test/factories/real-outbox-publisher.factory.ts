import { IEventBus } from '../../shared/ports/event-bus.port';
import { IOutboxPublisher } from '../../shared/ports/outbox-publisher.port';
import { IOutboxRepository } from '../../shared/ports/outbox-repository.port';
import { OutboxPublisher } from '../../shared/infrastructure/outbox/outbox-publisher';
import { OutboxRelayService } from '../../shared/infrastructure/outbox/outbox-relay.service';
import { makeConfigService } from '../infrastructure/fake-config-service';

// Shared factory for the 3 cron-job integration specs (TD24-S03, bad-smell-audit BE-3) that each
// independently hand-rolled a real OutboxPublisher wired to a real IOutboxRepository — inline
// dispatch defaults to disabled so tests control exactly when the relay runs, via an explicit
// relay.relay([rowId]) call rather than racing the after-commit callback.
export function makeRealOutboxPublisher(
  outboxRepo: IOutboxRepository,
  eventBus: IEventBus,
  inlineDispatchEnabled = false,
): IOutboxPublisher {
  const config = makeConfigService({ OUTBOX_INLINE_DISPATCH_ENABLED: inlineDispatchEnabled });
  const relay = new OutboxRelayService(outboxRepo, eventBus, config);
  return new OutboxPublisher(outboxRepo, relay, config);
}
