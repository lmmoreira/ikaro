import type { IOperatorAuditRepository } from '../../../contexts/billing/application/ports/operator-audit-repository.port';
import type { OperatorAudit } from '../../../contexts/billing/domain/operator-audit';

export class InMemoryOperatorAuditRepository implements IOperatorAuditRepository {
  readonly saved: OperatorAudit[] = [];

  async save(audit: OperatorAudit): Promise<void> {
    this.saved.push(audit);
  }

  async findByIdAndTenant(tenantId: string, id: string): Promise<OperatorAudit | null> {
    return this.saved.find((row) => row.tenantId === tenantId && row.id === id) ?? null;
  }
}
