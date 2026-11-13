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

export interface UnsuspendTenantUseCaseInput {
  tenantId: string;
  operator: string;
  reason: string;
  /** The request's correlation id (set by the correlation middleware), carried onto the events. */
  correlationId: string;
}

export type UnsuspendTenantUseCaseResult = OperatorBillingStateResult;

/**
 * UC-111: lifts an `OPERATOR` suspension, and only that one (`409 BILLING_UNSUSPEND_NOT_ALLOWED`
 * for a payment-based suspension). Raises `SubscriptionReactivated`. A tenant that is not suspended
 * is already in the requested state: a no-op, with no audit row and no event.
 */
@Injectable()
export class UnsuspendTenantUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(OPERATOR_AUDIT_REPOSITORY) private readonly audits: IOperatorAuditRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(input: UnsuspendTenantUseCaseInput): Promise<UnsuspendTenantUseCaseResult> {
    return this.txManager.run(async () => {
      const subscription = await loadSubscriptionForUpdate(this.subscriptions, input.tenantId);
      const now = this.clock.now();
      if (subscription.unsuspendOperator(now, input.correlationId)) {
        await this.subscriptions.save(subscription);
        await this.audits.save(
          OperatorAudit.record({
            tenantId: input.tenantId,
            actor: input.operator,
            action: 'UNSUSPEND',
            reason: input.reason,
            details: { resultingStatus: subscription.status },
            now,
          }),
        );
      }
      return toOperatorBillingState(subscription);
    });
  }
}
