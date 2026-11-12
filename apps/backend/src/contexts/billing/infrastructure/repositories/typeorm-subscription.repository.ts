import { Injectable } from '@nestjs/common';
import type { FeatureKey } from '@ikaro/validation';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';
import { runInNewTransaction } from '../../../../shared/infrastructure/run-in-new-transaction';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { ISubscriptionRepository } from '../../application/ports/subscription-repository.port';
import {
  SubscriptionAlreadyExistsError,
  SubscriptionConcurrentModificationError,
} from '../../domain/errors/billing-domain.error';
import { Subscription } from '../../domain/subscription.aggregate';
import { SubscriptionItemEntity } from '../entities/subscription-item.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import {
  itemToEntity,
  subscriptionToDomain,
  subscriptionToEntity,
  subscriptionUpdateSet,
} from './typeorm-subscription.mapper';

const SUBSCRIPTION_TENANT_UNIQUE_INDEX = 'UQ_billing_subscriptions_tenant';

function sameWindow(row: SubscriptionItemEntity, next: SubscriptionItemEntity): boolean {
  return (
    row.tier === next.tier &&
    row.startsAt.getTime() === next.startsAt.getTime() &&
    (row.endsAt?.getTime() ?? null) === (next.endsAt?.getTime() ?? null)
  );
}

@Injectable()
export class TypeOrmSubscriptionRepository implements ISubscriptionRepository {
  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly repo: Repository<SubscriptionEntity>,
  ) {}

  findByTenantId(tenantId: string): Promise<Subscription | null> {
    return this.load(this.repo.manager, tenantId, false);
  }

  async findByTenantIdForUpdate(tenantId: string): Promise<Subscription | null> {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('findByTenantIdForUpdate must be called inside an active transaction');
    }
    return this.load(manager, tenantId, true);
  }

  async save(subscription: Subscription): Promise<void> {
    const manager = getActiveEntityManager();
    if (manager) {
      await this.persist(manager, subscription);
    } else {
      await runInNewTransaction(this.repo.manager, (tx) => this.persist(tx, subscription));
    }
  }

  // Cross-tenant system read: the partial index on `suspended_at WHERE status = 'SUSPENDED'`
  // serves both the filter and the order. Ids only.
  async listSuspendedTenantIds(): Promise<string[]> {
    const rows = await this.buildSuspendedIdsQuery().getRawMany<{ tenantId: string }>();
    return rows.map((row) => row.tenantId);
  }

  // Cross-tenant system read: operational, non-trial subscriptions with no item for the feature
  // active at `now` (same window as `SubscriptionItem.isActiveAt`). The anti-join probes
  // `IDX_billing_subscription_items_subscription (tenant_id, subscription_id)` per subscription.
  async findTenantIdsNotEntitledTo(featureKey: FeatureKey, now: Date): Promise<string[]> {
    const rows = await this.buildNotEntitledQuery(featureKey, now).getRawMany<{
      tenantId: string;
    }>();
    return rows.map((row) => row.tenantId);
  }

  // The two batch queries are public so the integration spec can `EXPLAIN` the exact SQL that runs.
  buildSuspendedIdsQuery(): SelectQueryBuilder<SubscriptionEntity> {
    return this.repo
      .createQueryBuilder('s')
      .select('s.tenantId', 'tenantId')
      .where('s.status = :status', { status: 'SUSPENDED' })
      .orderBy('s.suspendedAt', 'ASC');
  }

  buildNotEntitledQuery(featureKey: FeatureKey, now: Date): SelectQueryBuilder<SubscriptionEntity> {
    return this.repo
      .createQueryBuilder('s')
      .select('s.tenantId', 'tenantId')
      .where('s.status IN (:...statuses)', { statuses: ['ACTIVE', 'PAST_DUE'] })
      .andWhere((qb) => {
        const items = qb
          .subQuery()
          .select('1')
          .from(SubscriptionItemEntity, 'i')
          .where('i.tenantId = s.tenantId')
          .andWhere('i.subscriptionId = s.id')
          .andWhere('i.featureKey = :featureKey')
          .andWhere('i.startsAt <= :now')
          .andWhere('(i.endsAt IS NULL OR i.endsAt > :now)')
          .getQuery();
        return `NOT EXISTS ${items}`;
      })
      .setParameters({ featureKey, now })
      .orderBy('s.tenantId', 'ASC');
  }

  private async load(
    manager: EntityManager,
    tenantId: string,
    lock: boolean,
  ): Promise<Subscription | null> {
    const entity = await manager.findOne(SubscriptionEntity, {
      where: { tenantId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) return null;
    const items = await manager.find(SubscriptionItemEntity, {
      where: { tenantId, subscriptionId: entity.id },
      order: { startsAt: 'ASC', id: 'ASC' },
    });
    return subscriptionToDomain(entity, items);
  }

  private async persist(manager: EntityManager, subscription: Subscription): Promise<void> {
    const isNew = subscription.version === undefined;
    const nextVersion = isNew ? 0 : (subscription.version as number) + 1;
    const entity = subscriptionToEntity(subscription, nextVersion);

    if (isNew) {
      await this.insert(manager, entity);
    } else {
      // Optimistic lock, the second line of defence next to B-R1: the row must still be at the
      // version this aggregate was read at.
      const result = await manager
        .createQueryBuilder()
        .update(SubscriptionEntity)
        .set(subscriptionUpdateSet(entity))
        .where('id = :id', { id: subscription.id })
        .andWhere('tenant_id = :tenantId', { tenantId: subscription.tenantId })
        .andWhere('version = :version', { version: subscription.version })
        .execute();
      if (result.affected !== 1) throw new SubscriptionConcurrentModificationError();
    }

    // A status-only change (sweep, payment) leaves the item rows alone entirely.
    if (subscription.itemsDirty) await this.syncItems(manager, subscription);
    subscription.markPersisted(nextVersion);
  }

  private async insert(manager: EntityManager, entity: SubscriptionEntity): Promise<void> {
    try {
      await manager.insert(SubscriptionEntity, entity);
    } catch (err) {
      const driverError = err instanceof QueryFailedError ? err.driverError : undefined;
      if (
        driverError?.code === '23505' &&
        driverError.constraint === SUBSCRIPTION_TENANT_UNIQUE_INDEX
      ) {
        throw new SubscriptionAlreadyExistsError();
      }
      throw err;
    }
  }

  // Diff by id against the stored rows, in an order the GIST exclusion accepts: delete the removed
  // (never-started) rows, shorten the changed ones, and only then insert the new ones — inserting
  // first would overlap the window an old row has not yet given up. Nothing is replaced wholesale.
  private async syncItems(manager: EntityManager, subscription: Subscription): Promise<void> {
    const { id: subscriptionId, tenantId } = subscription;
    const stored = await manager.find(SubscriptionItemEntity, {
      where: { tenantId, subscriptionId },
    });
    const desired = subscription.items.map((item) => itemToEntity(item, tenantId, subscriptionId));
    const storedById = new Map(stored.map((row) => [row.id, row]));
    const desiredIds = new Set(desired.map((row) => row.id));

    const removedIds = stored.filter((row) => !desiredIds.has(row.id)).map((row) => row.id);
    if (removedIds.length > 0) {
      await manager.delete(SubscriptionItemEntity, {
        tenantId,
        subscriptionId,
        id: In(removedIds),
      });
    }
    const changed = desired.filter((row) => {
      const existing = storedById.get(row.id);
      return existing !== undefined && !sameWindow(existing, row);
    });
    // One after another on this transaction's single connection, in the aggregate's item order.
    await mapSequentially(changed, (row) =>
      manager.update(
        SubscriptionItemEntity,
        { id: row.id, tenantId },
        { tier: row.tier, startsAt: row.startsAt, endsAt: row.endsAt },
      ),
    );
    const added = desired.filter((row) => !storedById.has(row.id));
    if (added.length > 0) await manager.insert(SubscriptionItemEntity, added);
  }
}
