import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { OperatorAudit } from '../../domain/operator-audit';
import {
  IOperatorAuditRepository,
  OPERATOR_AUDIT_REPOSITORY,
} from '../ports/operator-audit-repository.port';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';
import {
  loadSubscriptionForUpdate,
  type OperatorBillingStateResult,
  toOperatorBillingState,
} from './operator-billing.shared';

export interface ExtendGraceUseCaseInput {
  tenantId: string;
  operator: string;
  reason: string;
  /** ISO-8601 UTC. */
  graceUntil: string;
}

export type ExtendGraceUseCaseResult = OperatorBillingStateResult;

/**
 * UC-111: sets `graceUntil` on a `PAST_DUE` tenant. It only extends the 14 days, never shortens
 * them; both refusals are `409 BILLING_GRACE_NOT_ALLOWED`. The same instant again is a no-op (no
 * audit row). No event: nothing downstream reacts to a grace change.
 */
@Injectable()
export class ExtendGraceUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(OPERATOR_AUDIT_REPOSITORY) private readonly audits: IOperatorAuditRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(input: ExtendGraceUseCaseInput): Promise<ExtendGraceUseCaseResult> {
    return this.txManager.run(async () => {
      const subscription = await loadSubscriptionForUpdate(this.subscriptions, input.tenantId);
      const graceUntil = new Date(input.graceUntil);
      if (subscription.extendGrace(graceUntil)) {
        await this.subscriptions.save(subscription);
        await this.audits.save(
          OperatorAudit.record({
            tenantId: input.tenantId,
            actor: input.operator,
            action: 'GRACE',
            reason: input.reason,
            details: { graceUntil: graceUntil.toISOString() },
            now: this.clock.now(),
          }),
        );
      }
      return toOperatorBillingState(subscription);
    });
  }
}
