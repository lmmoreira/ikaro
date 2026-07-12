import { Envelope } from '../../shared/domain/envelope';
import {
  getActiveEntityManager,
  scheduleAfterCommit,
} from '../../shared/infrastructure/transaction-context';
import { IEventBus } from '../../shared/ports/event-bus.port';
import { IOutboxPublisher } from '../../shared/ports/outbox-publisher.port';
import { ITriggerBus } from '../../shared/ports/trigger-bus.port';

/**
 * In-process event bus for integration tests — also bound to OUTBOX_PUBLISHER (TD24-S02), since
 * its publish(event: Envelope) shape already satisfies IOutboxPublisher.
 *
 * Uses BFS (breadth-first) dispatch to match Pub/Sub semantics:
 * when a handler publishes a nested event, that event is queued and processed
 * only after ALL handlers for the current event have finished. This prevents
 * ordering races (e.g. TenantProvisionedHandler fires StaffInvited before
 * TenantProvisionedNotificationHandler has seeded templates) that would not
 * occur in production where every subscription processes independently.
 *
 * Dispatch is deferred via scheduleAfterCommit() whenever a transaction is ambient at publish()
 * time (TD24-S02) — the 3 aggregate repositories now drain domain events through this bus (as
 * OUTBOX_PUBLISHER) from inside their own save(), which runs inside the caller's txManager.run().
 * Dispatching synchronously there would run handlers mid-transaction, on a separate connection
 * that cannot see the uncommitted write. Deferring means dispatch only starts once
 * getActiveEntityManager() has gone back to undefined (flushAfterCommitCallbacks always runs
 * outside any ambient transaction scope — see transaction-context.ts), so the deferred callback
 * must still compose with the BFS queue below rather than dispatch directly: an enclosing
 * handler's own nested txManager.run() call can still be mid-dispatch (this.dispatching === true)
 * on the JS call stack even though no transaction is ambient at that exact moment.
 *
 * Handler errors are swallowed (mirrors Pub/Sub fire-and-forget from the
 * publisher's perspective). The handler's own try/catch still writes FAILED
 * logs before rethrowing, so dispatch-failure tests can assert on DB state
 * immediately after publish() returns, then explicitly republish to simulate
 * a deterministic retry.
 */
export class RoutingInMemoryEventBus implements IEventBus, ITriggerBus, IOutboxPublisher {
  private readonly handlers = new Map<string, Array<(event: Envelope) => Promise<void>>>();
  private readonly triggerHandlers = new Map<string, Array<() => Promise<void>>>();
  readonly published: Envelope[] = [];
  private readonly queue: Envelope[] = [];
  private dispatching = false;

  async publish(event: Envelope): Promise<void> {
    this.published.push(event);

    if (getActiveEntityManager()) {
      // Ambient transaction active — defer until it commits (mirrors the outbox's real
      // "record now, dispatch after commit" semantics for OUTBOX_PUBLISHER callers).
      await scheduleAfterCommit(() => this.enqueueOrDispatch(event));
      return;
    }

    await this.enqueueOrDispatch(event);
  }

  private async enqueueOrDispatch(event: Envelope): Promise<void> {
    if (this.dispatching) {
      // Nested publish during handler execution — enqueue for BFS processing.
      this.queue.push(event);
      return;
    }

    this.dispatching = true;
    try {
      await this.runHandlers(event);
      while (this.queue.length > 0) {
        await this.runHandlers(this.queue.shift()!);
      }
    } finally {
      this.dispatching = false;
    }
  }

  private async runHandlers(event: Envelope): Promise<void> {
    for (const handler of this.handlers.get(event.eventName) ?? []) {
      try {
        await handler(event as never);
      } catch {
        // swallow: matches Pub/Sub fire-and-forget from the publisher's perspective
      }
    }
  }

  subscribe<T extends Envelope>(
    eventName: string,
    handler: (event: T) => Promise<void>,
    _consumerName: string,
  ): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler as (event: Envelope) => Promise<void>);
    this.handlers.set(eventName, list);
  }

  registerTrigger(name: string, handler: () => Promise<void>, _consumerName: string): void {
    const list = this.triggerHandlers.get(name) ?? [];
    list.push(handler);
    this.triggerHandlers.set(name, list);
  }

  // Unlike push mode in the real adapter (which rethrows so the controller responds 5xx), errors
  // here are swallowed to match this class's own publish()/runHandlers() convention — deterministic,
  // synchronous dispatch for integration-spec assertions immediately after the HTTP call resolves.
  async publishTrigger(name: string): Promise<void> {
    for (const handler of this.triggerHandlers.get(name) ?? []) {
      try {
        await handler();
      } catch {
        // swallow: matches this class's domain-event dispatch convention
      }
    }
  }

  clear(): void {
    this.published.length = 0;
  }
}
