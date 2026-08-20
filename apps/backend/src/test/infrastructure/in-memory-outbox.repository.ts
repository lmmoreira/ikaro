import { Envelope } from '../../shared/domain/envelope';
import {
  IOutboxRepository,
  OutboxClaim,
  UnpublishedBacklog,
} from '../../shared/ports/outbox-repository.port';

export interface RecordedOutboxInsert {
  event: Envelope;
  dedupKey: string;
}

export interface RecordedOutboxClaimById {
  id: string;
  leaseToken: string;
  leaseSeconds: number;
}

export interface RecordedOutboxSweep {
  graceSeconds: number;
  batchSize: number;
  leaseToken: string;
  leaseSeconds: number;
}

export interface RecordedOutboxReleaseClaim {
  id: string;
  leaseToken: string;
}

export interface RecordedOutboxMarkPublished {
  id: string;
  leaseToken?: string;
}

export class InMemoryOutboxRepository implements IOutboxRepository {
  readonly inserted: RecordedOutboxInsert[] = [];
  readonly claimedById: RecordedOutboxClaimById[] = [];
  readonly markedPublished: RecordedOutboxMarkPublished[] = [];
  readonly swept: RecordedOutboxSweep[] = [];
  readonly releasedClaims: RecordedOutboxReleaseClaim[] = [];
  countUnpublishedCallCount = 0;
  deleteOldPublishedCallCount = 0;

  private nextInsertId: string | undefined;
  private nextClaimByIdResult: OutboxClaim | null = null;
  // FIFO queue drained first (mirrors jest's mockResolvedValueOnce chain), falling back to
  // `sweepDefaultResult` once empty (mirrors mockResolvedValue's persistent default).
  private readonly sweepResultQueue: OutboxClaim[][] = [];
  private sweepDefaultResult: OutboxClaim[] = [];
  private unpublishedBacklog: UnpublishedBacklog = { count: 0, oldestAgeSeconds: null };
  private deleteOldPublishedResult = 0;

  async insert(event: Envelope, dedupKey: string): Promise<string | undefined> {
    this.inserted.push({ event, dedupKey });
    return this.nextInsertId;
  }

  setNextInsertId(id: string | undefined): void {
    this.nextInsertId = id;
  }

  async claimUnpublishedById(
    id: string,
    leaseToken: string,
    leaseSeconds: number,
  ): Promise<OutboxClaim | null> {
    this.claimedById.push({ id, leaseToken, leaseSeconds });
    return this.nextClaimByIdResult;
  }

  setNextClaimByIdResult(result: OutboxClaim | null): void {
    this.nextClaimByIdResult = result;
  }

  async markPublished(id: string, leaseToken?: string): Promise<void> {
    this.markedPublished.push({ id, leaseToken });
  }

  async claimUnpublished(
    graceSeconds: number,
    batchSize: number,
    leaseToken: string,
    leaseSeconds: number,
  ): Promise<OutboxClaim[]> {
    this.swept.push({ graceSeconds, batchSize, leaseToken, leaseSeconds });
    return this.sweepResultQueue.length > 0
      ? this.sweepResultQueue.shift()!
      : this.sweepDefaultResult;
  }

  queueSweepResult(result: OutboxClaim[]): void {
    this.sweepResultQueue.push(result);
  }

  setSweepDefaultResult(result: OutboxClaim[]): void {
    this.sweepDefaultResult = result;
  }

  async releaseClaim(id: string, leaseToken: string): Promise<void> {
    this.releasedClaims.push({ id, leaseToken });
  }

  async countUnpublished(): Promise<UnpublishedBacklog> {
    this.countUnpublishedCallCount++;
    return this.unpublishedBacklog;
  }

  setUnpublishedBacklog(backlog: UnpublishedBacklog): void {
    this.unpublishedBacklog = backlog;
  }

  async deleteOldPublished(_retentionDays: number, _batchSize: number): Promise<number> {
    this.deleteOldPublishedCallCount++;
    return this.deleteOldPublishedResult;
  }

  setDeleteOldPublishedResult(count: number): void {
    this.deleteOldPublishedResult = count;
  }
}
