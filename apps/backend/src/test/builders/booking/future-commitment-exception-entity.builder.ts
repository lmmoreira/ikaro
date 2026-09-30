import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { FutureCommitmentExceptionEntity } from '../../../contexts/booking/infrastructure/entities/future-commitment-exception.entity';
import {
  FutureCommitmentAlternative,
  FutureCommitmentExceptionResolutionType,
  FutureCommitmentExceptionStatus,
} from '../../../contexts/booking/domain/future-commitment-exception.types';

export class FutureCommitmentExceptionEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private sourceId = uuidv7();
  private affectedId = uuidv7();
  private status: FutureCommitmentExceptionStatus = 'OPEN';
  private resolutionType: FutureCommitmentExceptionResolutionType | null = null;
  private resolutionReason: string | null = null;
  private resolvedByStaffId: string | null = null;
  private resolvedAt: Date | null = null;
  private alternatives: FutureCommitmentAlternative[] = [];
  private readonly createdAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withSourceId(sourceId: string): this {
    this.sourceId = sourceId;
    return this;
  }

  withAffectedId(affectedId: string): this {
    this.affectedId = affectedId;
    return this;
  }

  withStatus(status: FutureCommitmentExceptionStatus): this {
    this.status = status;
    return this;
  }

  withResolution(
    resolutionType: FutureCommitmentExceptionResolutionType | null,
    resolvedByStaffId: string,
    reason: string | null = null,
  ): this {
    this.status = 'RESOLVED';
    this.resolutionType = resolutionType;
    this.resolvedByStaffId = resolvedByStaffId;
    this.resolutionReason = reason;
    this.resolvedAt = new Date('2026-01-02T00:00:00Z');
    return this;
  }

  withAlternatives(alternatives: FutureCommitmentAlternative[]): this {
    this.alternatives = alternatives;
    return this;
  }

  build(): FutureCommitmentExceptionEntity {
    const e = new FutureCommitmentExceptionEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.sourceType = 'RESOURCE_DEACTIVATION';
    e.sourceId = this.sourceId;
    e.affectedType = 'BOOKING';
    e.affectedId = this.affectedId;
    e.status = this.status;
    e.ownerStaffId = null;
    e.resolutionType = this.resolutionType;
    e.resolutionReason = this.resolutionReason;
    e.resolvedByStaffId = this.resolvedByStaffId;
    e.resolvedAt = this.resolvedAt;
    e.notificationOutcome = null;
    e.alternatives = this.alternatives;
    e.createdAt = this.createdAt;
    return e;
  }
}
