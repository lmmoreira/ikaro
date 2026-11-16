import { ExpirySweepStateEntity } from '../../../contexts/loyalty/infrastructure/entities/expiry-sweep-state.entity';

export class ExpirySweepStateEntityBuilder {
  private processedThrough = new Date();
  private updatedAt = new Date();

  withProcessedThrough(processedThrough: Date): this {
    this.processedThrough = processedThrough;
    return this;
  }

  withUpdatedAt(updatedAt: Date): this {
    this.updatedAt = updatedAt;
    return this;
  }

  build(): ExpirySweepStateEntity {
    const entity = new ExpirySweepStateEntity();
    entity.id = 1;
    entity.processedThrough = this.processedThrough;
    entity.updatedAt = this.updatedAt;
    return entity;
  }
}
