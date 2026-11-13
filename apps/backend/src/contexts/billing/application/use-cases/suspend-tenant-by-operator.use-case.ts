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
} from '../helpers/operator-billing.helpers';

export interface SuspendTenantByOperatorUseCaseInput {
  tenantId: string;
  operator: string;
  reason: string;
  /** The request's correlation id (set by the correlation middleware), carried onto the events. */
  correlationId: string;
}

export type SuspendTenantByOperatorUseCaseResult = OperatorBillingStateResult;

/**
 * UC-111: suspends a tenant for abuse or takedown (reason `OPERATOR`). Payment does not lift it;
 * only `unsuspend` (or making the tenant exempt) does. Refuses an exempt tenant. The subscription
 * change, its `SubscriptionSuspended` outbox row and the audit row commit together; an
 * tenant that is already suspended, for any reason, is left as it is: no audit row, no event (so a
 * payment suspension can never be turned into one the operator can lift). The access cache
 * is evicted by the cached repository after the commit.
 */
@Injectable()
export class SuspendTenantByOperatorUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(OPERATOR_AUDIT_REPOSITORY) private readonly audits: IOperatorAuditRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(
    input: SuspendTenantByOperatorUseCaseInput,
  ): Promise<SuspendTenantByOperatorUseCaseResult> {
    return this.txManager.run(async () => {
      const subscription = await loadSubscriptionForUpdate(this.subscriptions, input.tenantId);
      const now = this.clock.now();
      const previousReason = subscription.suspensionReason;
      if (subscription.suspendByOperator(now, input.correlationId)) {
        await this.subscriptions.save(subscription);
        await this.audits.save(
          OperatorAudit.record({
            tenantId: input.tenantId,
            actor: input.operator,
            action: 'SUSPEND',
            reason: input.reason,
            details: { previousReason },
            now,
          }),
        );
      }
      return toOperatorBillingState(subscription);
    });
  }
}
