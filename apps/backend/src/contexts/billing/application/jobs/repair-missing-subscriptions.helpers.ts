import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { BILLING_JOB_PAGE_SIZE, SELF_HEAL_REPAIR_BUDGET_MS } from '../../domain/billing-constants';
import { pageThroughSelection } from '../helpers/page-through-selection';
import {
  BILLING_PLATFORM_PORT,
  type BillingTenantCursor,
  type BillingTenantInfo,
  IBillingPlatformPort,
} from '../ports/billing-platform.port';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';
import { CreateTrialSubscriptionUseCase } from '../use-cases/create-trial-subscription.use-case';
import { PROVISIONING_GRACE_MINUTES } from '../use-cases/get-tenant-access.use-case';

/** Platform's keyset position of the tenant a page ended on. */
const cursorAfter = (last?: BillingTenantInfo): BillingTenantCursor | undefined =>
  last === undefined ? undefined : { createdAt: last.createdAt, id: last.tenantId };

export interface RepairMissingSubscriptionsStepInput {
  now: Date;
  correlationId: string;
}

export interface RepairMissingSubscriptionsStepResult {
  /** The tenants older than the provisioning window that were looked at. */
  scanned: number;
  /** Tenants with no subscription whose trial this run created. */
  repaired: number;
  /** `is_active = false` tenants: never repaired. */
  skippedInactive: number;
  /** Tenants whose repair threw; each one is logged with its id, and the run tried all the others. */
  failed: number;
  /** The run reached `SELF_HEAL_REPAIR_BUDGET_MS` before the listing was exhausted. */
  truncated: boolean;
  /** Every failure the run kept going past, in order. */
  failures: readonly unknown[];
}

/**
 * UC-140 step 1: a tenant older than `PROVISIONING_GRACE_MINUTES` with no subscription gets its
 * trial through `CreateTrialSubscriptionUseCase` (idempotent, `UNIQUE (tenant_id)`). The tenants
 * come from Platform's read-only keyset listing, one page at a time; each page is diffed against
 * Billing's own `subscriptions` by `findExistingTenantIds`, so no query joins across contexts. A
 * healthy tenant stays in the listing, so the walk always starts at the oldest tenant and runs to
 * the end or to `SELF_HEAL_REPAIR_BUDGET_MS`.
 *
 * The repair has no registration and no event: the trial starts at the injected clock's now (a
 * full 14 days) with the tenant's country, timezone and slug, no `adminEmail` and no billing email
 * (Notification falls back to the managers). An operator-provisioned `exempt` tenant whose event
 * was lost therefore gets a paying trial; the operator fixes it with UC-137.
 */
@Injectable()
export class RepairMissingSubscriptionsStep {
  private readonly logger = new AppLogger(RepairMissingSubscriptionsStep.name);

  constructor(
    @Inject(BILLING_PLATFORM_PORT) private readonly platform: IBillingPlatformPort,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    private readonly createTrial: CreateTrialSubscriptionUseCase,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(
    input: RepairMissingSubscriptionsStepInput,
  ): Promise<RepairMissingSubscriptionsStepResult> {
    const cutoff = new Date(input.now.getTime() - PROVISIONING_GRACE_MINUTES * 60_000);
    const result = {
      scanned: 0,
      repaired: 0,
      skippedInactive: 0,
      failed: 0,
      truncated: false,
    };
    const failures: unknown[] = [];

    const deadline = this.clock.now().getTime() + SELF_HEAL_REPAIR_BUDGET_MS;
    const outcome = await pageThroughSelection<BillingTenantInfo>({
      fetch: (last) =>
        this.platform.listTenantsCreatedBefore(cutoff, BILLING_JOB_PAGE_SIZE, cursorAfter(last)),
      // Past the budget no further page is read; a short last page ends the run before it is asked,
      // so a run that reaches its budget exactly on the last page is not truncated.
      shouldStop: () => this.clock.now().getTime() >= deadline,
      onPage: (page) => {
        result.scanned += page.length;
        return this.repairPage(page, input, result, failures);
      },
      onFailure: (error) => {
        failures.push(error);
      },
    });
    result.truncated = outcome === 'STOPPED';
    return { ...result, failures };
  }

  private async repairPage(
    page: readonly BillingTenantInfo[],
    input: RepairMissingSubscriptionsStepInput,
    result: { repaired: number; skippedInactive: number; failed: number },
    failures: unknown[],
  ): Promise<void> {
    const active = page.filter((tenant) => tenant.isActive);
    result.skippedInactive += page.length - active.length;
    const existing = new Set(
      await this.subscriptions.findExistingTenantIds(active.map((tenant) => tenant.tenantId)),
    );
    const missing = active.filter((tenant) => !existing.has(tenant.tenantId));
    await mapSequentially(missing, async (tenant) => {
      try {
        const created = await this.createTrial.execute({
          tenantId: tenant.tenantId,
          slug: tenant.slug,
          countryCode: tenant.countryCode,
          timezone: tenant.timezone,
          occurredAt: input.now.toISOString(),
          correlationId: uuidv7(),
        });
        if (created.created) {
          result.repaired += 1;
          this.logger.log('billing_self_heal_repaired', {
            tenantId: tenant.tenantId,
            correlationId: input.correlationId,
          });
        }
      } catch (err) {
        result.failed += 1;
        failures.push(err);
        // The alert reads repeated lines for one tenant id (the job keeps no counter, S36).
        this.logger.error('billing_self_heal_repair_failed', undefined, {
          tenantId: tenant.tenantId,
          correlationId: input.correlationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }
}
