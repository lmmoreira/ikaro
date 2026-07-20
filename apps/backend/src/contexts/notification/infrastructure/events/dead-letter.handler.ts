import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Envelope } from '../../../../shared/domain/envelope';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';

// Envelope, not DomainEvent — the DLQ can receive a dead-lettered Command just as easily as a
// dead-lettered DomainEvent (GcpPubSubEventBusAdapter.publishToDlq() routes both here).
type DeadLetterEvent = Envelope & {
  readonly deliveryAttempt?: number;
  readonly deadLetterReason?: string;
};

@Injectable()
export class DeadLetterHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'monitor';

  private readonly logger = new AppLogger(DeadLetterHandler.name);

  constructor(@Inject(EVENT_BUS) private readonly eventBus: IEventBus) {}

  onModuleInit(): void {
    this.eventBus.subscribe<Envelope>(
      'dead-letter',
      (event) => this.handle(event),
      DeadLetterHandler.CONSUMER_NAME,
    );
  }

  async handle(event: Envelope): Promise<void> {
    const dlq = event as DeadLetterEvent;
    this.logger.error('Dead-letter message received — requires human investigation', undefined, {
      eventId: dlq.eventId,
      eventName: dlq.eventName,
      tenantId: dlq.tenantId,
      deliveryAttempt: dlq.deliveryAttempt,
      deadLetterReason: dlq.deadLetterReason,
    });
    // Does NOT throw — adapter must ACK to prevent infinite DLQ redelivery
  }
}
