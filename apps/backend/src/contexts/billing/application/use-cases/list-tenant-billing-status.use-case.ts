import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { daysBetweenUTC, todayInTimezone } from '../../../../shared/utils/calendar-date';
import type { SubscriptionStatus, SuspensionReason } from '../../domain/subscription.types';
import { iso } from '../helpers/billing-summary.helper';
import {
  CHARGE_REPOSITORY,
  type IChargeRepository,
  type OperatorChargeFact,
  type OperatorChargeSummary,
} from '../ports/charge-repository.port';
import {
  ISubscriptionRepository,
  type OperatorSubscriptionSummary,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';

export interface ListTenantBillingStatusUseCaseInput {
  status?: SubscriptionStatus;
  limit: number;
  offset: number;
}

export interface TenantBillingStatusItem {
  tenantId: string;
  status: SubscriptionStatus;
  suspensionReason: SuspensionReason | null;
  exempt: boolean;
  trialEndsAt: string | null;
  graceUntil: string | null;
  pastDueSince: string | null;
  suspendedAt: string | null;
  hasEverPaid: boolean;
  /** Whole days since the oldest `OVERDUE` charge's due date, counted in the subscription's zone; `null` when none is overdue. */
  overdueDays: number | null;
  /** The latest non-`CANCELED` charge, or `null` for a tenant with no charge. */
  lastCharge: OperatorChargeFact | null;
  /** The open `RECOVERY` charge, or `null`. */
  openRecovery: OperatorChargeFact | null;
}

export interface ListTenantBillingStatusUseCaseResult {
  items: TenantBillingStatusItem[];
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
}

function toItem(
  row: OperatorSubscriptionSummary,
  charges: OperatorChargeSummary | undefined,
  now: Date,
): TenantBillingStatusItem {
  const overdueSince = charges?.oldestOverdueDueDate ?? null;
  return {
    tenantId: row.tenantId,
    status: row.status,
    suspensionReason: row.suspensionReason,
    exempt: row.exempt,
    trialEndsAt: iso(row.trialEndsAt),
    graceUntil: iso(row.graceUntil),
    pastDueSince: iso(row.pastDueSince),
    suspendedAt: iso(row.suspendedAt),
    hasEverPaid: row.hasEverPaid,
    // Local days in the subscription's own zone, so the age never flips at UTC midnight.
    overdueDays:
      overdueSince === null
        ? null
        : Math.max(0, daysBetweenUTC(overdueSince, todayInTimezone(row.timezone, now))),
    lastCharge: charges?.lastCharge ?? null,
    openRecovery: charges?.openRecovery ?? null,
  };
}

/**
 * UC-111: the operator's read-only investigation lookup, one page of subscription facts and
 * Charge-derived facts per tenant (a lookup, never a daily worklist). The page's charge facts come
 * from one batched, tenant-scoped query (no query per row). Tenant names are Platform data and are
 * not returned.
 */
@Injectable()
export class ListTenantBillingStatusUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(
    input: ListTenantBillingStatusUseCaseInput,
  ): Promise<ListTenantBillingStatusUseCaseResult> {
    const { items, total } = await this.subscriptions.listSummaries({
      status: input.status,
      limit: input.limit,
      offset: input.offset,
    });
    const facts = await this.charges.summarizeForOperator(items.map((row) => row.tenantId));
    const factsByTenant = new Map(facts.map((summary) => [summary.tenantId, summary]));
    const now = this.clock.now();
    return {
      items: items.map((row) => toItem(row, factsByTenant.get(row.tenantId), now)),
      pagination: {
        limit: input.limit,
        offset: input.offset,
        total,
        hasMore: input.offset + input.limit < total,
      },
    };
  }
}
