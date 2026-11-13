import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import {
  SubscriptionBuilder,
  SubscriptionEntityBuilder,
  SubscriptionItemBuilder,
  SubscriptionItemEntityBuilder,
} from '../../../../test/builders/billing';
import {
  SubscriptionAlreadyExistsError,
  SubscriptionConcurrentModificationError,
} from '../../domain/errors/billing-domain.error';
import { Subscription } from '../../domain/subscription.aggregate';
import { SubscriptionItemEntity } from '../entities/subscription-item.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { TypeOrmSubscriptionRepository } from './typeorm-subscription.repository';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';

const TENANT = '0197a2b0-0000-7000-8000-0000000000aa';

interface Mocks {
  manager: jest.Mocked<EntityManager>;
  executeUpdate: jest.Mock;
  calls: string[];
}

function mockManager(): Mocks {
  const calls: string[] = [];
  const executeUpdate = jest.fn().mockResolvedValue({ affected: 1 });
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: executeUpdate,
  };
  const manager = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockImplementation((entity: unknown) => {
      calls.push(entity === SubscriptionEntity ? 'insert:subscription' : 'insert:item');
      return Promise.resolve();
    }),
    update: jest.fn().mockImplementation(() => {
      calls.push('update:item');
      return Promise.resolve();
    }),
    delete: jest.fn().mockImplementation(() => {
      calls.push('delete:item');
      return Promise.resolve();
    }),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    // runInNewTransaction sets a lock timeout through `query` before the work runs.
    query: jest.fn().mockResolvedValue(undefined),
    transaction: jest.fn(),
  } as unknown as jest.Mocked<EntityManager>;
  return { manager, executeUpdate, calls };
}

describe('TypeOrmSubscriptionRepository', () => {
  let mocks: Mocks;
  let repo: TypeOrmSubscriptionRepository;
  let outbox: InMemoryOutboxPublisher;

  const inTransaction = <T>(work: () => Promise<T>): Promise<T> =>
    runWithEntityManager(mocks.manager, work);

  beforeEach(() => {
    mocks = mockManager();
    outbox = new InMemoryOutboxPublisher();
    repo = new TypeOrmSubscriptionRepository(
      { manager: mocks.manager } as unknown as Repository<SubscriptionEntity>,
      outbox,
    );
  });

  describe('findByTenantId', () => {
    it('maps the row and its items to the aggregate, filtering both reads by tenant', async () => {
      const entity = new SubscriptionEntityBuilder()
        .withTenantId(TENANT)
        .withNextDueDate('2026-03-15')
        .withVersion(4)
        .build();
      entity.countryCode = 'BR';
      const item = new SubscriptionItemEntityBuilder()
        .withTenantId(TENANT)
        .withSubscriptionId(entity.id)
        .withFeatureKey('CHATBOT')
        .withTier('BASIC')
        .build();
      mocks.manager.findOne.mockResolvedValue(entity);
      mocks.manager.find.mockResolvedValue([item]);

      const result = await repo.findByTenantId(TENANT);

      expect(result).toBeInstanceOf(Subscription);
      expect(result?.countryCode.value).toBe('BR');
      expect(result?.nextDueDate?.value).toBe('2026-03-15');
      expect(result?.version).toBe(4);
      expect(result?.itemsDirty).toBe(false);
      expect(result?.items).toHaveLength(1);
      expect(result?.items[0]).toMatchObject({ featureKey: 'CHATBOT', tier: 'BASIC' });
      expect(mocks.manager.findOne).toHaveBeenCalledWith(SubscriptionEntity, {
        where: { tenantId: TENANT },
      });
      expect(mocks.manager.find).toHaveBeenCalledWith(SubscriptionItemEntity, {
        where: { tenantId: TENANT, subscriptionId: entity.id },
        order: { startsAt: 'ASC', id: 'ASC' },
      });
    });

    it('trims space-padded CHAR columns', async () => {
      const entity = new SubscriptionEntityBuilder().withTenantId(TENANT).build();
      entity.currency = 'BRL';
      entity.countryCode = 'BR';
      mocks.manager.findOne.mockResolvedValue(entity);

      const result = await repo.findByTenantId(TENANT);

      expect(result?.currency).toBe('BRL');
      expect(result?.countryCode).toEqual(CountryCode.reconstitute('BR'));
    });

    it('returns null without reading items when the tenant has no subscription', async () => {
      mocks.manager.findOne.mockResolvedValue(null);

      expect(await repo.findByTenantId(TENANT)).toBeNull();
      expect(mocks.manager.find).not.toHaveBeenCalled();
    });
  });

  describe('findByTenantIdForUpdate (B-R1)', () => {
    it('throws outside an active transaction', async () => {
      await expect(repo.findByTenantIdForUpdate(TENANT)).rejects.toThrow(
        'findByTenantIdForUpdate must be called inside an active transaction',
      );
    });

    it('takes a pessimistic write lock on the subscription row inside a transaction', async () => {
      mocks.manager.findOne.mockResolvedValue(
        new SubscriptionEntityBuilder().withTenantId(TENANT).build(),
      );

      const result = await inTransaction(() => repo.findByTenantIdForUpdate(TENANT));

      expect(result).toBeInstanceOf(Subscription);
      expect(mocks.manager.findOne).toHaveBeenCalledWith(SubscriptionEntity, {
        where: { tenantId: TENANT },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('returns null when there is nothing to lock', async () => {
      mocks.manager.findOne.mockResolvedValue(null);

      expect(await inTransaction(() => repo.findByTenantIdForUpdate(TENANT))).toBeNull();
    });
  });

  describe('save — a new subscription', () => {
    it('inserts the row at version 0, then the item rows, and records the stored version', async () => {
      const subscription = Subscription.startTrial({
        tenantId: TENANT,
        countryCode: CountryCode.create('BR'),
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        merchantProfileKey: 'BRL_FAKE',
        start: new Date('2026-01-10T15:00:00Z'),
      });

      await inTransaction(() => repo.save(subscription));

      expect(mocks.calls).toEqual(['insert:subscription', 'insert:item']);
      const inserted = mocks.manager.insert.mock.calls[0]![1] as SubscriptionEntity;
      expect(inserted).toMatchObject({ tenantId: TENANT, status: 'TRIALING', version: 0 });
      const rows = mocks.manager.insert.mock.calls[1]![1] as SubscriptionItemEntity[];
      expect(rows).toHaveLength(5);
      expect(
        rows.every((row) => row.tenantId === TENANT && row.subscriptionId === subscription.id),
      ).toBe(true);
      expect(subscription.version).toBe(0);
      expect(subscription.itemsDirty).toBe(false);
    });

    it('turns a violation of UNIQUE(tenant_id) into SubscriptionAlreadyExistsError', async () => {
      const driverError = Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'UQ_billing_subscriptions_tenant',
      });
      mocks.manager.insert.mockRejectedValueOnce(new QueryFailedError('INSERT', [], driverError));
      const subscription = new SubscriptionBuilder()
        .withTenantId(TENANT)
        .withVersion(undefined)
        .build();

      await expect(inTransaction(() => repo.save(subscription))).rejects.toThrow(
        SubscriptionAlreadyExistsError,
      );
    });

    it('rethrows any other insert failure unchanged', async () => {
      const boom = new Error('connection lost');
      mocks.manager.insert.mockRejectedValueOnce(boom);
      const subscription = new SubscriptionBuilder()
        .withTenantId(TENANT)
        .withVersion(undefined)
        .build();

      await expect(inTransaction(() => repo.save(subscription))).rejects.toBe(boom);
    });

    it('opens its own transaction when the caller has none', async () => {
      const tx = mockManager();
      (mocks.manager.transaction as jest.Mock).mockImplementation(
        (work: (m: EntityManager) => Promise<unknown>) => work(tx.manager),
      );
      const subscription = new SubscriptionBuilder()
        .withTenantId(TENANT)
        .withVersion(undefined)
        .build();

      await repo.save(subscription);

      expect(tx.manager.insert).toHaveBeenCalledWith(SubscriptionEntity, expect.anything());
      expect(mocks.manager.insert).not.toHaveBeenCalled();
    });
  });

  describe('save — a loaded subscription', () => {
    it('updates under the version it was read at and stores version + 1', async () => {
      const subscription = new SubscriptionBuilder()
        .withTenantId(TENANT)
        .withStatus('ACTIVE')
        .withVersion(3)
        .build();
      subscription.suspendByOperator(new Date('2026-03-01T12:00:00Z'), 'corr-1');

      await inTransaction(() => repo.save(subscription));

      const qb = mocks.manager.createQueryBuilder() as unknown as Record<string, jest.Mock>;
      expect(qb['andWhere']).toHaveBeenCalledWith('tenant_id = :tenantId', { tenantId: TENANT });
      expect(qb['andWhere']).toHaveBeenCalledWith('version = :version', { version: 3 });
      const set = qb['set']!.mock.calls[0]![0] as Partial<SubscriptionEntity>;
      expect(set).toMatchObject({ status: 'SUSPENDED', suspensionReason: 'OPERATOR', version: 4 });
      expect(subscription.version).toBe(4);
    });

    it("drains the aggregate's pending events into the outbox after the write, and only once", async () => {
      const subscription = new SubscriptionBuilder()
        .withTenantId(TENANT)
        .withStatus('ACTIVE')
        .withVersion(3)
        .build();
      subscription.suspendByOperator(new Date('2026-03-01T12:00:00Z'), 'corr-1');

      await inTransaction(() => repo.save(subscription));
      await inTransaction(() => repo.save(subscription));

      expect(outbox.published.map((event) => event.eventName)).toEqual(['SubscriptionSuspended']);
      expect(subscription.domainEvents).toEqual([]);
    });

    it('publishes nothing when the optimistic update loses (the write never happened)', async () => {
      const subscription = new SubscriptionBuilder().withTenantId(TENANT).withVersion(3).build();
      subscription.suspendByOperator(new Date('2026-03-01T12:00:00Z'), 'corr-1');
      mocks.executeUpdate.mockResolvedValueOnce({ affected: 0 });

      await expect(inTransaction(() => repo.save(subscription))).rejects.toThrow();

      expect(outbox.published).toHaveLength(0);
    });

    it('never rewrites the columns fixed at creation', async () => {
      const subscription = new SubscriptionBuilder().withTenantId(TENANT).withVersion(0).build();

      await inTransaction(() => repo.save(subscription));

      const qb = mocks.manager.createQueryBuilder() as unknown as Record<string, jest.Mock>;
      const set = qb['set']!.mock.calls[0]![0] as Record<string, unknown>;
      for (const fixed of [
        'id',
        'tenantId',
        'countryCode',
        'currency',
        'timezone',
        'merchantProfileKey',
        'cycle',
      ]) {
        expect(set).not.toHaveProperty(fixed);
      }
    });

    it('throws SubscriptionConcurrentModificationError when the version moved (0 rows affected)', async () => {
      mocks.executeUpdate.mockResolvedValueOnce({ affected: 0 });
      const subscription = new SubscriptionBuilder().withTenantId(TENANT).withVersion(3).build();

      await expect(inTransaction(() => repo.save(subscription))).rejects.toThrow(
        SubscriptionConcurrentModificationError,
      );
      expect(subscription.version).toBe(3);
    });

    it('writes no item row at all for a status-only change (itemsDirty false)', async () => {
      const subscription = new SubscriptionBuilder()
        .withTenantId(TENANT)
        .withStatus('ACTIVE')
        .withItems([new SubscriptionItemBuilder().build()])
        .withVersion(1)
        .build();
      subscription.suspendByOperator(new Date('2026-03-01T12:00:00Z'), 'corr-1');

      await inTransaction(() => repo.save(subscription));

      expect(subscription.itemsDirty).toBe(false);
      expect(mocks.manager.find).not.toHaveBeenCalled();
      expect(mocks.manager.insert).not.toHaveBeenCalled();
      expect(mocks.manager.update).not.toHaveBeenCalled();
      expect(mocks.manager.delete).not.toHaveBeenCalled();
    });

    it('diffs the items by id: delete removed, shorten changed, insert new — in that order', async () => {
      const now = new Date('2026-03-01T12:00:00Z');
      const running = new SubscriptionItemBuilder()
        .withFeatureKey('HOTSITE')
        .withStartsAt(new Date('2026-02-01T00:00:00Z'))
        .build();
      const future = new SubscriptionItemBuilder()
        .withFeatureKey('BOOKING')
        .withStartsAt(new Date('2026-03-10T00:00:00Z'))
        .build();
      const untouched = new SubscriptionItemBuilder()
        .withFeatureKey('LEAD_FORM')
        .withStartsAt(new Date('2026-02-01T00:00:00Z'))
        .withEndsAt(new Date('2026-02-20T00:00:00Z'))
        .build();
      const subscription = new SubscriptionBuilder()
        .withTenantId(TENANT)
        .withStatus('ACTIVE')
        .withItems([running, future, untouched])
        .withVersion(1)
        .build();
      const storedRow = (item: typeof running): SubscriptionItemEntity =>
        new SubscriptionItemEntityBuilder()
          .withId(item.id)
          .withTenantId(TENANT)
          .withSubscriptionId(subscription.id)
          .withFeatureKey(item.featureKey)
          .withStartsAt(item.startsAt)
          .withEndsAt(item.endsAt)
          .build();
      mocks.manager.find.mockResolvedValue([
        storedRow(running),
        storedRow(future),
        storedRow(untouched),
      ]);

      subscription.setExempt(now, 'operator-7', 'corr-1');
      await inTransaction(() => repo.save(subscription));

      // BOOKING's not-yet-started item is deleted; the running ones are end-dated at now; the five
      // open-ended items are inserted last, so the GIST exclusion never sees an overlap.
      expect(mocks.calls).toEqual(['delete:item', 'update:item', 'insert:item']);
      expect(mocks.manager.delete).toHaveBeenCalledWith(SubscriptionItemEntity, {
        tenantId: TENANT,
        subscriptionId: subscription.id,
        id: expect.anything(),
      });
      const [, criteria, changes] = mocks.manager.update.mock.calls[0]!;
      expect(criteria).toEqual({ id: running.id, tenantId: TENANT });
      expect(changes).toMatchObject({ endsAt: now });
      expect(mocks.manager.update).toHaveBeenCalledTimes(1); // the history row is unchanged
      const inserted = mocks.manager.insert.mock.calls[0]![1] as SubscriptionItemEntity[];
      expect(inserted).toHaveLength(5);
      expect(inserted.every((row) => row.tenantId === TENANT && row.endsAt === null)).toBe(true);
    });
  });
});
