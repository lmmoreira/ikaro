import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { OperatorAudit } from '../../domain/operator-audit';
import { BILLING_PLATFORM_PORT, type IBillingPlatformPort } from '../ports/billing-platform.port';
import {
  BILLING_PROVISIONING_CONFIG,
  type BillingProvisioningConfig,
} from '../ports/billing-provisioning-config.port';
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

export interface SetTenantExemptUseCaseInput {
  tenantId: string;
  operator: string;
  reason: string;
  exempt: boolean;
}

export type SetTenantExemptUseCaseResult = OperatorBillingStateResult;

/**
 * UC-137: sets or clears free access. Set: `ACTIVE`, exempt, every feature open-ended (a suspended
 * tenant is reactivated without payment and raises `SubscriptionReactivated`). Clear: a fresh
 * trial window; refused (`403 BILLING_EXEMPT_PROTECTED`) for Ikaro's own tenant. The use case
 * resolves `isPlatformOwner` from the tenant's slug; the aggregate never reads configuration.
 * In M25 no charge can exist, so cancelling open charges is a no-op hook M26-S20 fills in here.
 */
@Injectable()
export class SetTenantExemptUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(OPERATOR_AUDIT_REPOSITORY) private readonly audits: IOperatorAuditRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(BILLING_PLATFORM_PORT) private readonly platform: IBillingPlatformPort,
    @Inject(BILLING_PROVISIONING_CONFIG) private readonly config: BillingProvisioningConfig,
  ) {}

  async execute(input: SetTenantExemptUseCaseInput): Promise<SetTenantExemptUseCaseResult> {
    const correlationId = uuidv7();
    // A cross-context read, outside the transaction: never I/O inside the locked section.
    // Only a clear needs it: the owner tenant is the one that is never un-exempted.
    const isPlatformOwner = !input.exempt && (await this.isPlatformOwner(input.tenantId));
    return this.txManager.run(async () => {
      const subscription = await loadSubscriptionForUpdate(this.subscriptions, input.tenantId);
      const now = this.clock.now();
      const changed = input.exempt
        ? subscription.setExempt(now, input.operator, correlationId)
        : subscription.clearExempt(now, input.operator, isPlatformOwner);
      if (changed) {
        await this.subscriptions.save(subscription);
        await this.audits.save(
          OperatorAudit.record({
            tenantId: input.tenantId,
            actor: input.operator,
            action: 'SET_EXEMPT',
            reason: input.reason,
            details: { exempt: input.exempt },
            now,
          }),
        );
      }
      return toOperatorBillingState(subscription);
    });
  }

  private async isPlatformOwner(tenantId: string): Promise<boolean> {
    const { platformOwnerSlug } = this.config;
    if (platformOwnerSlug === null) return false;
    const info = await this.platform.getTenantInfo(tenantId);
    return info.slug === platformOwnerSlug;
  }
}
