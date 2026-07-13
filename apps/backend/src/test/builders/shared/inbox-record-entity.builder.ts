import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { InboxRecordEntity } from '../../../shared/infrastructure/inbox/inbox-record.entity';

export class InboxRecordEntityBuilder {
  private eventId = uuidv7();
  private consumerName = 'STUB_CONSUMER';
  private processedAt = new Date('2026-01-01T00:00:00Z');

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  withConsumerName(consumerName: string): this {
    this.consumerName = consumerName;
    return this;
  }

  withProcessedAt(processedAt: Date): this {
    this.processedAt = processedAt;
    return this;
  }

  build(): InboxRecordEntity {
    const e = new InboxRecordEntity();
    e.eventId = this.eventId;
    e.consumerName = this.consumerName;
    e.processedAt = this.processedAt;
    return e;
  }
}
