import { ExpirySweepStateEntity } from '../../../contexts/loyalty/infrastructure/entities/expiry-sweep-state.entity';

export class ExpirySweepStateEntityBuilder {
  private jobName = 'loyalty-expiry-sweep';
  private processedThrough = new Date();
  private updatedAt = new Date();

  withJobName(jobName: string): this {
    this.jobName = jobName;
    return this;
  }

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
    entity.jobName = this.jobName;
    entity.processedThrough = this.processedThrough;
    entity.updatedAt = this.updatedAt;
    return entity;
  }
}
