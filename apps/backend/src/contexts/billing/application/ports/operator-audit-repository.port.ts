import type { OperatorAudit } from '../../domain/operator-audit';

export const OPERATOR_AUDIT_REPOSITORY = Symbol('IOperatorAuditRepository');

/**
 * Append-only: a row is never updated or deleted by the application (M27's purge anonymizes the
 * payloads separately). S15b's use cases call `save` inside the same `ITransactionManager.run()` as
 * the subscription change they audit.
 */
export interface IOperatorAuditRepository {
  save(audit: OperatorAudit): Promise<void>;

  /** The record with this id for this tenant, or `null` (another tenant's id answers `null`). */
  findByIdAndTenant(tenantId: string, id: string): Promise<OperatorAudit | null>;
}
