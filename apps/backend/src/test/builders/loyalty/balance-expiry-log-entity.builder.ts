import { BalanceExpiryLogEntity } from '../../../contexts/loyalty/infrastructure/entities/balance-expiry-log.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class BalanceExpiryLogEntityBuilder {
  private entryId = uuidv7();
  private processedAt = new Date();

  withEntryId(entryId: string): this {
    this.entryId = entryId;
    return this;
  }

  withProcessedAt(processedAt: Date): this {
    this.processedAt = processedAt;
    return this;
  }

  build(): BalanceExpiryLogEntity {
    const entity = new BalanceExpiryLogEntity();
    entity.entryId = this.entryId;
    entity.processedAt = this.processedAt;
    return entity;
  }
}
