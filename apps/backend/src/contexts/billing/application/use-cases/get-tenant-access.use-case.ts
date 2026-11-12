import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import type { TenantAccess } from '../../../../shared/ports/tenant-access.port';
import { BillingTenantNotFoundError } from '../../domain/errors/billing-domain.error';
import { defaultSelection } from '../../domain/plan-selection';
import type { Subscription } from '../../domain/subscription.aggregate';
import { BILLING_PLATFORM_PORT, type IBillingPlatformPort } from '../ports/billing-platform.port';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';

/** A tenant younger than this with no subscription yet is a pending trial, not an incident (UC-120 A1). */
export const PROVISIONING_GRACE_MINUTES = 15;

export interface GetTenantAccessUseCaseInput {
  tenantId: string;
}

export type GetTenantAccessUseCaseResult = TenantAccess;

/**
 * UC-120: resolves one tenant's access. A subscription answers through `entitledAt(now)` (the one
 * entitlement formula). A *successfully read* missing subscription is a provisioning incident: a
 * pending trial inside `PROVISIONING_GRACE_MINUTES`, a denial after it. A *transient lookup error*
 * fails open (`degraded`, never cached by the adapter); an unknown tenant is a typed not-found.
 */
@Injectable()
export class GetTenantAccessUseCase {
  private readonly logger = new AppLogger(GetTenantAccessUseCase.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(BILLING_PLATFORM_PORT) private readonly platform: IBillingPlatformPort,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(input: GetTenantAccessUseCaseInput): Promise<GetTenantAccessUseCaseResult> {
    const { tenantId } = input;
    try {
      const subscription = await this.subscriptions.findByTenantId(tenantId);
      if (subscription) return this.fromSubscription(subscription);
      return await this.resolveMissingSubscription(tenantId);
    } catch (err: unknown) {
      if (err instanceof BillingTenantNotFoundError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Access lookup failed for tenant '${tenantId}', failing open: ${message}`);
      return this.failOpen();
    }
  }

  private fromSubscription(subscription: Subscription): TenantAccess {
    const status = subscription.status;
    return {
      status,
      suspensionReason: status === 'SUSPENDED' ? subscription.suspensionReason : null,
      operational: status !== 'SUSPENDED',
      features: subscription
        .entitledAt(this.clock.now())
        .map((entry) => ({ key: entry.featureKey, tier: entry.tier })),
    };
  }

  private async resolveMissingSubscription(tenantId: string): Promise<TenantAccess> {
    // An unknown tenant throws BillingTenantNotFoundError here and is never answered as access.
    const tenant = await this.platform.getTenantInfo(tenantId);
    const ageMs = this.clock.now().getTime() - tenant.createdAt.getTime();
    if (ageMs < PROVISIONING_GRACE_MINUTES * 60_000) {
      return { ...this.trialShaped(), provisional: true };
    }
    this.logger.error(
      `Tenant '${tenantId}' has no subscription after the provisioning window; access denied`,
    );
    return { status: 'SUSPENDED', suspensionReason: null, operational: false, features: [] };
  }

  /** Exactly what `TRIALING` grants: every sellable feature, chatbot at `BASIC`. */
  private trialShaped(): TenantAccess {
    return {
      status: 'TRIALING',
      suspensionReason: null,
      operational: true,
      features: defaultSelection().map((entry) => ({ key: entry.featureKey, tier: entry.tier })),
    };
  }

  private failOpen(): TenantAccess {
    return { ...this.trialShaped(), status: 'ACTIVE', degraded: true };
  }
}
