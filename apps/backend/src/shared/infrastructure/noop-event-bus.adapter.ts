import { Injectable } from '@nestjs/common';
import { DomainEvent } from '../domain/domain-event';
import { AppLogger } from '../observability/app-logger';
import { IEventBus } from '../ports/event-bus.port';

@Injectable()
export class NoopEventBusAdapter implements IEventBus {
  private readonly logger = new AppLogger(NoopEventBusAdapter.name);

  async publish(event: DomainEvent): Promise<void> {
    this.logger.debug(`[noop] event published: ${event.eventName}`, {
      tenantId: event.tenantId,
      eventId: event.eventId,
      correlationId: event.correlationId,
    });
  }

  subscribe<T extends DomainEvent>(
    _eventName: string,
    _handler: (event: T) => Promise<void>,
    _consumerName: string,
  ): void {
    // no-op
  }
}
