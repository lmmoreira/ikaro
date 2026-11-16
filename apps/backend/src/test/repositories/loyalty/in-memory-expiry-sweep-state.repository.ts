import { IExpirySweepStateRepository } from '../../../contexts/loyalty/application/ports/expiry-sweep-state-repository.port';

export class InMemoryExpirySweepStateRepository implements IExpirySweepStateRepository {
  private processedThrough: Date | null = null;

  /** Every `advanceTo` call that reached the repository, in order. */
  readonly advanceCalls: Date[] = [];

  /** Seeds the watermark, standing in for an earlier successful run. */
  seed(processedThrough: Date | null): void {
    this.processedThrough = processedThrough;
  }

  async getProcessedThrough(): Promise<Date | null> {
    return this.processedThrough;
  }

  async advanceTo(processedThrough: Date): Promise<void> {
    this.advanceCalls.push(processedThrough);
    if (this.processedThrough === null || processedThrough > this.processedThrough) {
      this.processedThrough = processedThrough;
    }
  }

  clear(): void {
    this.processedThrough = null;
    this.advanceCalls.length = 0;
  }
}
