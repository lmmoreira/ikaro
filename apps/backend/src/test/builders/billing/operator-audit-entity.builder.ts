import type { OperatorAuditPayload } from '../../../contexts/billing/domain/operator-audit';
import { OperatorAuditEntity } from '../../../contexts/billing/infrastructure/entities/operator-audit.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

/** A `SUSPEND` row whose payload carries its reason. */
export class OperatorAuditEntityBuilder {
  private id = uuidv7();
  private tenantId = uuidv7();
  private actor = 'ops@ikaro';
  private action = 'SUSPEND';
  private payload: OperatorAuditPayload = { reason: 'abuse report' };
  private occurredAt = new Date(Date.now() - 60_000);

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withActor(actor: string): this {
    this.actor = actor;
    return this;
  }

  withAction(action: string): this {
    this.action = action;
    return this;
  }

  withPayload(payload: OperatorAuditPayload): this {
    this.payload = payload;
    return this;
  }

  withOccurredAt(occurredAt: Date): this {
    this.occurredAt = occurredAt;
    return this;
  }

  build(): OperatorAuditEntity {
    const e = new OperatorAuditEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.actor = this.actor;
    e.action = this.action;
    e.payload = this.payload;
    e.occurredAt = this.occurredAt;
    return e;
  }
}
