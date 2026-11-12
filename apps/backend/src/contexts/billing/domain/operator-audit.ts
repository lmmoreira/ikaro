import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { OperatorAuditInvariantError } from './errors/billing-domain.error';

/**
 * The tenant-scoped operator actions that leave an audit row. Mirrors
 * `CHK_billing_operator_audit_action` (backend-only: no `@ikaro/types` copy exists, so no
 * `closedEnumRegistry` entry). Price-list changes have no tenant and are audited on
 * `feature_price_versions`, never here.
 */
export const OPERATOR_AUDIT_ACTIONS = ['GRACE', 'SUSPEND', 'UNSUSPEND', 'SET_EXEMPT'] as const;
export type OperatorAuditAction = (typeof OPERATOR_AUDIT_ACTIONS)[number];

/** `actor` is `VARCHAR(100)`. */
export const OPERATOR_AUDIT_ACTOR_MAX_LENGTH = 100;
/** The serialized `payload` (reason included) may not exceed this many UTF-8 bytes. */
export const OPERATOR_AUDIT_PAYLOAD_MAX_BYTES = 4096;

/** A flat, JSON-scalar fact: audit details stay small and readable, never a nested document. */
export type OperatorAuditValue = string | number | boolean | null;
export type OperatorAuditDetails = Readonly<Record<string, OperatorAuditValue>>;
/** The JSONB `payload` column value: the details plus the reason. */
export type OperatorAuditPayload = Record<string, OperatorAuditValue>;

export interface OperatorAuditProps {
  id: string;
  tenantId: string;
  actor: string;
  action: OperatorAuditAction;
  reason: string;
  /** Action-specific facts (for example `graceUntil`); never carries `reason`. */
  details: OperatorAuditDetails;
  occurredAt: Date;
}

export interface RecordOperatorAuditInput {
  tenantId: string;
  actor: string;
  action: OperatorAuditAction;
  reason: string;
  details?: OperatorAuditDetails;
  now: Date;
}

/**
 * Who changed what for a tenant: a thin, append-only record (no events, no state transitions).
 * The table has no `reason` column, so the reason is stored inside the bounded JSONB `payload`
 * (`payload()`); the domain keeps it as its own required field.
 */
export class OperatorAudit {
  readonly id: string;
  readonly tenantId: string;
  readonly actor: string;
  readonly action: OperatorAuditAction;
  readonly reason: string;
  readonly details: OperatorAuditDetails;
  readonly occurredAt: Date;

  private constructor(props: OperatorAuditProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.actor = props.actor;
    this.action = props.action;
    this.reason = props.reason;
    this.details = props.details;
    this.occurredAt = props.occurredAt;
  }

  static record(input: RecordOperatorAuditInput): OperatorAudit {
    const actor = input.actor.trim();
    const reason = input.reason.trim();
    const details = input.details ?? {};
    if (actor.length === 0) throw new OperatorAuditInvariantError('actor must not be empty');
    if (actor.length > OPERATOR_AUDIT_ACTOR_MAX_LENGTH) {
      throw new OperatorAuditInvariantError(
        `actor must be at most ${OPERATOR_AUDIT_ACTOR_MAX_LENGTH} characters`,
      );
    }
    if (reason.length === 0) throw new OperatorAuditInvariantError('reason must not be empty');
    if (Object.hasOwn(details, 'reason')) {
      throw new OperatorAuditInvariantError('details must not carry a "reason" key');
    }
    const audit = new OperatorAudit({
      id: uuidv7(),
      tenantId: input.tenantId,
      actor,
      action: input.action,
      reason,
      details,
      occurredAt: input.now,
    });
    const bytes = Buffer.byteLength(JSON.stringify(audit.payload()), 'utf8');
    if (bytes > OPERATOR_AUDIT_PAYLOAD_MAX_BYTES) {
      throw new OperatorAuditInvariantError(
        `payload is ${bytes} bytes; the limit is ${OPERATOR_AUDIT_PAYLOAD_MAX_BYTES}`,
      );
    }
    return audit;
  }

  /** Rebuilds a persisted record; the invariants were checked when it was recorded. */
  static reconstitute(props: OperatorAuditProps): OperatorAudit {
    return new OperatorAudit(props);
  }

  payload(): OperatorAuditPayload {
    return { ...this.details, reason: this.reason };
  }
}
