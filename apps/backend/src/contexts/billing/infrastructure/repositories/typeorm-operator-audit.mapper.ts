import { OperatorAudit, type OperatorAuditAction } from '../../domain/operator-audit';
import { OperatorAuditEntity } from '../entities/operator-audit.entity';

export function operatorAuditToEntity(audit: OperatorAudit): OperatorAuditEntity {
  const entity = new OperatorAuditEntity();
  entity.id = audit.id;
  entity.tenantId = audit.tenantId;
  entity.actor = audit.actor;
  entity.action = audit.action;
  entity.payload = audit.payload();
  entity.occurredAt = audit.occurredAt;
  return entity;
}

export function operatorAuditToDomain(entity: OperatorAuditEntity): OperatorAudit {
  const { reason, ...details } = entity.payload;
  return OperatorAudit.reconstitute({
    id: entity.id,
    tenantId: entity.tenantId,
    actor: entity.actor,
    action: entity.action as OperatorAuditAction,
    reason: typeof reason === 'string' ? reason : '',
    details,
    occurredAt: entity.occurredAt,
  });
}
