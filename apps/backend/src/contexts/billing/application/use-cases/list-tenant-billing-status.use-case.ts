import { Inject, Injectable } from '@nestjs/common';
import type { SubscriptionStatus, SuspensionReason } from '../../domain/subscription.types';
import {
  ISubscriptionRepository,
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
}

export interface ListTenantBillingStatusUseCaseResult {
  items: TenantBillingStatusItem[];
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
}

const iso = (date: Date | null): string | null => date?.toISOString() ?? null;

/**
 * UC-111: the operator's read-only investigation lookup, one page of subscription-derived facts per
 * tenant (a lookup, never a daily worklist). The Charge-derived fields (overdue age, last charge)
 * arrive with M26's list extension; tenant names are Platform data and are not returned.
 */
@Injectable()
export class ListTenantBillingStatusUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
  ) {}

  async execute(
    input: ListTenantBillingStatusUseCaseInput,
  ): Promise<ListTenantBillingStatusUseCaseResult> {
    const { items, total } = await this.subscriptions.listSummaries({
      status: input.status,
      limit: input.limit,
      offset: input.offset,
    });
    return {
      items: items.map((row) => ({
        tenantId: row.tenantId,
        status: row.status,
        suspensionReason: row.suspensionReason,
        exempt: row.exempt,
        trialEndsAt: iso(row.trialEndsAt),
        graceUntil: iso(row.graceUntil),
        pastDueSince: iso(row.pastDueSince),
        suspendedAt: iso(row.suspendedAt),
        hasEverPaid: row.hasEverPaid,
      })),
      pagination: {
        limit: input.limit,
        offset: input.offset,
        total,
        hasMore: input.offset + input.limit < total,
      },
    };
  }
}
