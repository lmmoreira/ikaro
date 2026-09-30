import { FutureCommitmentException } from '../../domain/future-commitment-exception.aggregate';
import { FutureCommitmentExceptionEntity } from '../entities/future-commitment-exception.entity';

export function toDomain(entity: FutureCommitmentExceptionEntity): FutureCommitmentException {
  return FutureCommitmentException.reconstitute({
    id: entity.id,
    tenantId: entity.tenantId,
    sourceType: entity.sourceType,
    sourceId: entity.sourceId,
    affectedType: entity.affectedType,
    affectedId: entity.affectedId,
    status: entity.status,
    ownerStaffId: entity.ownerStaffId,
    resolutionType: entity.resolutionType,
    resolutionReason: entity.resolutionReason,
    resolvedByStaffId: entity.resolvedByStaffId,
    resolvedAt: entity.resolvedAt,
    notificationOutcome: entity.notificationOutcome,
    alternatives: entity.alternatives,
    createdAt: entity.createdAt,
  });
}

export function toEntity(exception: FutureCommitmentException): FutureCommitmentExceptionEntity {
  const entity = new FutureCommitmentExceptionEntity();
  entity.id = exception.id;
  entity.tenantId = exception.tenantId;
  entity.sourceType = exception.sourceType;
  entity.sourceId = exception.sourceId;
  entity.affectedType = exception.affectedType;
  entity.affectedId = exception.affectedId;
  entity.status = exception.status;
  entity.ownerStaffId = exception.ownerStaffId;
  entity.resolutionType = exception.resolutionType;
  entity.resolutionReason = exception.resolutionReason;
  entity.resolvedByStaffId = exception.resolvedByStaffId;
  entity.resolvedAt = exception.resolvedAt;
  entity.notificationOutcome = exception.notificationOutcome;
  entity.alternatives = exception.alternatives;
  entity.createdAt = exception.createdAt;
  return entity;
}
