import { Inject, Injectable } from '@nestjs/common';
import type { FeatureKey } from '@ikaro/validation';
import { scheduleAfterCommit } from '../../../../shared/infrastructure/transaction-context';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CACHE_PORT, type CachePort } from '../../../../shared/ports/cache.port';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { Timezone } from '../../../../shared/value-objects/timezone.vo';
import type {
  ISubscriptionRepository,
  ListOperatorSubscriptionsQuery,
  OperatorSubscriptionSummary,
} from '../../application/ports/subscription-repository.port';
import type { FeatureTier } from '../../domain/feature-price.aggregate';
import {
  Subscription,
  type SubscriptionCycle,
  type SubscriptionStatus,
  type SuspensionReason,
} from '../../domain/subscription.aggregate';
import { SubscriptionItem } from '../../domain/subscription-item';
import { TypeOrmSubscriptionRepository } from './typeorm-subscription.repository';

interface ItemCacheRecord {
  id: string;
  featureKey: FeatureKey;
  tier: FeatureTier;
  startsAt: string;
  endsAt: string | null;
  createdBy: string;
}

// Dates are ISO strings and value objects are their raw values, so the record survives a JSON
// round-trip through any cache backend.
interface SubscriptionCacheRecord {
  id: string;
  tenantId: string;
  status: SubscriptionStatus;
  suspensionReason: SuspensionReason | null;
  countryCode: string;
  currency: string;
  timezone: string;
  merchantProfileKey: string;
  cycle: SubscriptionCycle;
  anchorDay: number;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextDueDate: string | null;
  pastDueSince: string | null;
  graceUntil: string | null;
  cancelAt: string | null;
  planConfirmedAt: string | null;
  suspendedAt: string | null;
  purgeWarning30SentAt: string | null;
  purgeWarning7SentAt: string | null;
  hasEverPaid: boolean;
  exempt: boolean;
  items: ItemCacheRecord[];
  version: number | undefined;
}

const toIso = (date: Date | null): string | null => (date === null ? null : date.toISOString());
const fromIso = (value: string | null): Date | null => (value === null ? null : new Date(value));

/**
 * Read cache in front of the subscription repository (the same decorator shape as
 * `CachingTenantRepository`), so every reader gets it: the access resolver, the `TenantAccessPort`
 * and any future use case. Asymmetric TTLs: an operational subscription 60 s, a `SUSPENDED` one
 * 10 s, so a paying tenant comes back fast. `save()` evicts after commit, which covers every writer
 * (the trial handler, the operator and webhook use cases to come) with no code of their own;
 * `CachePort` has no cross-instance broadcast, so other instances rely on the TTL.
 *
 * Only a present subscription is cached: a missing one is never stored, so the 15-minute
 * provisioning window is evaluated on every request and ends exactly on time. The locking read
 * bypasses the cache, and so do the cross-tenant batch reads (they are not per-tenant answers).
 */
@Injectable()
export class CachingSubscriptionRepository implements ISubscriptionRepository {
  static readonly OPERATIONAL_TTL_MS = 60_000;
  static readonly SUSPENDED_TTL_MS = 10_000;
  private static readonly CACHE_KEY_PREFIX = 'billing:subscription:';

  private readonly logger = new AppLogger(CachingSubscriptionRepository.name);

  constructor(
    // The concrete class is the DI token: the interface type is erased at runtime, and this keeps
    // the decorator substitutable by an in-memory repository in specs.
    @Inject(TypeOrmSubscriptionRepository) private readonly repo: ISubscriptionRepository,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
  ) {}

  async findByTenantId(tenantId: string): Promise<Subscription | null> {
    const cached = await this.readCache(tenantId);
    if (cached) return this.toDomain(cached);

    const subscription = await this.repo.findByTenantId(tenantId);
    if (!subscription) return null;

    await this.writeCache(subscription);
    return subscription;
  }

  // Deliberately bypasses the cache: a locking read backing a write-time check must see the
  // current committed row, never a stale cached copy.
  findByTenantIdForUpdate(tenantId: string): Promise<Subscription | null> {
    return this.repo.findByTenantIdForUpdate(tenantId);
  }

  async save(subscription: Subscription): Promise<void> {
    await this.repo.save(subscription);
    await scheduleAfterCommit(() => this.invalidate(subscription.tenantId));
  }

  listSuspendedTenantIds(): Promise<string[]> {
    return this.repo.listSuspendedTenantIds();
  }

  listSummaries(
    query: ListOperatorSubscriptionsQuery,
  ): Promise<{ items: OperatorSubscriptionSummary[]; total: number }> {
    return this.repo.listSummaries(query);
  }

  findTenantIdsNotEntitledTo(featureKey: FeatureKey, now: Date): Promise<string[]> {
    return this.repo.findTenantIdsNotEntitledTo(featureKey, now);
  }

  private cacheKey(tenantId: string): string {
    return `${CachingSubscriptionRepository.CACHE_KEY_PREFIX}${tenantId}`;
  }

  private async readCache(tenantId: string): Promise<SubscriptionCacheRecord | null> {
    try {
      return (await this.cache.get<SubscriptionCacheRecord>(this.cacheKey(tenantId))) ?? null;
    } catch (err: unknown) {
      this.logger.warn(`Cache read failed for ${this.cacheKey(tenantId)}: ${describe(err)}`);
      return null;
    }
  }

  private async writeCache(subscription: Subscription): Promise<void> {
    const ttl =
      subscription.status === 'SUSPENDED'
        ? CachingSubscriptionRepository.SUSPENDED_TTL_MS
        : CachingSubscriptionRepository.OPERATIONAL_TTL_MS;
    const key = this.cacheKey(subscription.tenantId);
    try {
      await this.cache.set(key, this.toCacheRecord(subscription), ttl);
    } catch (err: unknown) {
      this.logger.warn(`Cache write failed for ${key}: ${describe(err)}`);
    }
  }

  private async invalidate(tenantId: string): Promise<void> {
    try {
      await this.cache.del(this.cacheKey(tenantId));
    } catch (err: unknown) {
      this.logger.warn(
        `Cache invalidation failed for ${this.cacheKey(tenantId)}: ${describe(err)}`,
      );
    }
  }

  private toCacheRecord(subscription: Subscription): SubscriptionCacheRecord {
    return {
      id: subscription.id,
      tenantId: subscription.tenantId,
      status: subscription.status,
      suspensionReason: subscription.suspensionReason,
      countryCode: subscription.countryCode.value,
      currency: subscription.currency,
      timezone: subscription.timezone.value,
      merchantProfileKey: subscription.merchantProfileKey,
      cycle: subscription.cycle,
      anchorDay: subscription.anchorDay,
      trialEndsAt: toIso(subscription.trialEndsAt),
      currentPeriodStart: toIso(subscription.currentPeriodStart),
      currentPeriodEnd: toIso(subscription.currentPeriodEnd),
      nextDueDate: subscription.nextDueDate?.value ?? null,
      pastDueSince: toIso(subscription.pastDueSince),
      graceUntil: toIso(subscription.graceUntil),
      cancelAt: toIso(subscription.cancelAt),
      planConfirmedAt: toIso(subscription.planConfirmedAt),
      suspendedAt: toIso(subscription.suspendedAt),
      purgeWarning30SentAt: toIso(subscription.purgeWarning30SentAt),
      purgeWarning7SentAt: toIso(subscription.purgeWarning7SentAt),
      hasEverPaid: subscription.hasEverPaid,
      exempt: subscription.exempt,
      items: subscription.items.map((item) => ({
        id: item.id,
        featureKey: item.featureKey,
        tier: item.tier,
        startsAt: item.startsAt.toISOString(),
        endsAt: toIso(item.endsAt),
        createdBy: item.createdBy,
      })),
      version: subscription.version,
    };
  }

  private toDomain(record: SubscriptionCacheRecord): Subscription {
    return Subscription.reconstitute({
      id: record.id,
      tenantId: record.tenantId,
      status: record.status,
      suspensionReason: record.suspensionReason,
      countryCode: CountryCode.reconstitute(record.countryCode),
      currency: record.currency,
      timezone: Timezone.create(record.timezone),
      merchantProfileKey: record.merchantProfileKey,
      cycle: record.cycle,
      anchorDay: record.anchorDay,
      trialEndsAt: fromIso(record.trialEndsAt),
      currentPeriodStart: fromIso(record.currentPeriodStart),
      currentPeriodEnd: fromIso(record.currentPeriodEnd),
      nextDueDate:
        record.nextDueDate === null ? null : CalendarDate.reconstitute(record.nextDueDate),
      pastDueSince: fromIso(record.pastDueSince),
      graceUntil: fromIso(record.graceUntil),
      cancelAt: fromIso(record.cancelAt),
      planConfirmedAt: fromIso(record.planConfirmedAt),
      suspendedAt: fromIso(record.suspendedAt),
      purgeWarning30SentAt: fromIso(record.purgeWarning30SentAt),
      purgeWarning7SentAt: fromIso(record.purgeWarning7SentAt),
      hasEverPaid: record.hasEverPaid,
      exempt: record.exempt,
      items: record.items.map((item) =>
        SubscriptionItem.reconstitute({
          id: item.id,
          featureKey: item.featureKey,
          tier: item.tier,
          startsAt: new Date(item.startsAt),
          endsAt: fromIso(item.endsAt),
          createdBy: item.createdBy,
        }),
      ),
      version: record.version,
    });
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
