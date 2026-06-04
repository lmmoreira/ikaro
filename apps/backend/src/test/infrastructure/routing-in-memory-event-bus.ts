import { DomainEvent } from '../../shared/domain/domain-event';
import { IEventBus } from '../../shared/ports/event-bus.port';

/**
 * Synchronous, in-process event bus for integration tests.
 *
 * Uses BFS (breadth-first) dispatch to match Pub/Sub semantics:
 * when a handler publishes a nested event, that event is queued and processed
 * only after ALL handlers for the current event have finished. This prevents
 * ordering races (e.g. TenantProvisionedHandler fires StaffInvited before
 * TenantProvisionedNotificationHandler has seeded templates) that would not
 * occur in production where every subscription processes independently.
 *
 * Handler errors are swallowed (mirrors Pub/Sub fire-and-forget from the
 * publisher's perspective). The handler's own try/catch still writes FAILED
 * logs before rethrowing, so dispatch-failure tests can assert on DB state
 * immediately after publish() returns, then explicitly republish to simulate
 * a deterministic retry.
 */
export class RoutingInMemoryEventBus implements IEventBus {
  private readonly handlers = new Map<string, Array<(event: DomainEvent) => Promise<void>>>();
  readonly published: DomainEvent[] = [];
  private readonly queue: DomainEvent[] = [];
  private dispatching = false;

  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);

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

  private async runHandlers(event: DomainEvent): Promise<void> {
    for (const handler of this.handlers.get(event.eventName) ?? []) {
      try {
        await handler(event as never);
      } catch {
        // swallow: matches Pub/Sub fire-and-forget from the publisher's perspective
      }
    }
  }

  subscribe<T extends DomainEvent>(
    eventName: string,
    handler: (event: T) => Promise<void>,
    _consumerName: string,
  ): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler as (event: DomainEvent) => Promise<void>);
    this.handlers.set(eventName, list);
  }

  clear(): void {
    this.published.length = 0;
  }
}
