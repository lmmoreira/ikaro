import { Inject, Injectable } from '@nestjs/common';
import { Envelope } from '../../domain/envelope';
import { AppLogger } from '../../observability/app-logger';
import { EVENT_BUS_TRANSPORT, IEventBus, SubscribeOptions } from '../../ports/event-bus.port';
import {
  TENANT_ACCESS_PORT,
  type TenantAccess,
  type TenantAccessPort,
} from '../../ports/tenant-access.port';

/**
 * The bus handlers inject (`EVENT_BUS`): a decorator over the transport that applies a
 * subscription's {@link SubscribeOptions} when its handler is registered (M25-S21a, UC-125).
 *
 * Why a decorator and not code inside the Pub/Sub adapter: the transport must not depend on
 * Billing. `TENANT_ACCESS_PORT` reaches `OUTBOX_PUBLISHER`, whose relay publishes through the
 * bus, so a transport that asked the access port would close a dependency cycle. Here the
 * transport sits below the gate and the relay, `TRIGGER_BUS` and `PUSHABLE_EVENT_BUS` stay on it.
 *
 * Because the wrapper is applied at `subscribe()`, the pull path, the push path and the in-memory
 * bus all run the same gate, and no handler contains access logic.
 */
@Injectable()
export class GatedEventBus implements IEventBus {
  private readonly logger = new AppLogger(GatedEventBus.name);

  constructor(
    @Inject(EVENT_BUS_TRANSPORT) private readonly transport: IEventBus,
    @Inject(TENANT_ACCESS_PORT) private readonly access: TenantAccessPort,
  ) {}

  publish(event: Envelope): Promise<void> {
    return this.transport.publish(event);
  }

  subscribe<T extends Envelope>(
    eventName: string,
    handler: (event: T) => Promise<void>,
    consumerName: string,
    options?: SubscribeOptions,
  ): void {
    // The default is to run: nothing to check, nothing to wrap, no lookup per delivery.
    if (!options?.skipWhenSuspended && !options?.requires) {
      this.transport.subscribe(eventName, handler, consumerName);
      return;
    }
    this.transport.subscribe(
      eventName,
      (event: T) => this.deliver(event, handler, consumerName, options),
      consumerName,
    );
  }

  private async deliver<T extends Envelope>(
    event: T,
    handler: (event: T) => Promise<void>,
    consumerName: string,
    options: SubscribeOptions,
  ): Promise<void> {
    // Fail open on an envelope without a tenant (the dead-letter handler's may lack one).
    if (!event.tenantId) return handler(event);

    let access: TenantAccess;
    try {
      access = await this.access.getAccess(event.tenantId);
    } catch (err) {
      // Fail open on a lookup error: a Billing read failure must never stop event delivery.
      this.logger.warn('Tenant access lookup failed; delivering the event anyway', {
        tenantId: event.tenantId,
        eventId: event.eventId,
        consumerName,
        error: err instanceof Error ? err.message : String(err),
      });
      return handler(event);
    }

    if (this.shouldSkip(access, options)) {
      // Returning normally acknowledges the message: a skipped event is dropped, never replayed.
      this.logger.log('Event skipped for tenant', {
        tenantId: event.tenantId,
        eventId: event.eventId,
        eventName: event.eventName,
        consumerName,
      });
      return;
    }
    return handler(event);
  }

  private shouldSkip(access: TenantAccess, options: SubscribeOptions): boolean {
    if (options.skipWhenSuspended && !access.operational) return true;
    if (options.requires) {
      const entitled =
        access.operational && access.features.some((feature) => feature.key === options.requires);
      if (!entitled) return true;
    }
    return false;
  }
}
