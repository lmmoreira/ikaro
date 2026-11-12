import {
  OperatorAudit,
  type OperatorAuditAction,
  type OperatorAuditDetails,
} from '../../../contexts/billing/domain/operator-audit';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

/** A persisted-looking record (`reconstitute`): a `SUSPEND` by `ops@ikaro` with a reason. */
export class OperatorAuditBuilder {
  private id = uuidv7();
  private tenantId = uuidv7();
  private actor = 'ops@ikaro';
  private action: OperatorAuditAction = 'SUSPEND';
  private reason = 'abuse report';
  private details: OperatorAuditDetails = {};
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

  withAction(action: OperatorAuditAction): this {
    this.action = action;
    return this;
  }

  withReason(reason: string): this {
    this.reason = reason;
    return this;
  }

  withDetails(details: OperatorAuditDetails): this {
    this.details = details;
    return this;
  }

  withOccurredAt(occurredAt: Date): this {
    this.occurredAt = occurredAt;
    return this;
  }

  build(): OperatorAudit {
    return OperatorAudit.reconstitute({
      id: this.id,
      tenantId: this.tenantId,
      actor: this.actor,
      action: this.action,
      reason: this.reason,
      details: this.details,
      occurredAt: this.occurredAt,
    });
  }
}
