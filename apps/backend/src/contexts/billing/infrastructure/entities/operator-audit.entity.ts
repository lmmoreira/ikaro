import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { OperatorAuditPayload } from '../../domain/operator-audit';

// The table has no `reason` column: the reason lives inside `payload` (OperatorAudit.payload()).
@Entity('operator_audit', { schema: 'billing' })
export class OperatorAuditEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 100 })
  actor!: string;

  @Column({ type: 'varchar', length: 20 })
  action!: string;

  @Column({ type: 'jsonb' })
  payload!: OperatorAuditPayload;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;
}
