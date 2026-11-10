import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { runInNewTransaction } from '../../../../shared/infrastructure/run-in-new-transaction';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
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
        .set(subscriptionUpdateSet(entity) as QueryDeepPartialEntity<SubscriptionEntity>)
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
      await manager.insert(
        SubscriptionEntity,
        entity as QueryDeepPartialEntity<SubscriptionEntity>,
      );
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
    for (const row of desired) {
      const existing = storedById.get(row.id);
      if (existing && !sameWindow(existing, row)) {
        await manager.update(
          SubscriptionItemEntity,
          { id: row.id, tenantId },
          { tier: row.tier, startsAt: row.startsAt, endsAt: row.endsAt },
        );
      }
    }
    const added = desired.filter((row) => !storedById.has(row.id));
    if (added.length > 0) await manager.insert(SubscriptionItemEntity, added);
  }
}
