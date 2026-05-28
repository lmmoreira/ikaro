import { ProcessedEventEntity } from '../../../contexts/loyalty/infrastructure/entities/processed-event.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class ProcessedEventEntityBuilder {
  private eventId = uuidv7();
  private consumerName = 'RECORD_LOYALTY_ENTRY';
  private readonly processedAt = new Date();

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  withConsumerName(consumerName: string): this {
    this.consumerName = consumerName;
    return this;
  }

  build(): ProcessedEventEntity {
    const entity = new ProcessedEventEntity();
    entity.eventId = this.eventId;
    entity.consumerName = this.consumerName;
    entity.processedAt = this.processedAt;
    return entity;
  }
}
