import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  ChargeBuilder,
  ChargeEntityBuilder,
  ChargeLineBuilder,
  ChargeLineEntityBuilder,
} from '../../../../test/builders/billing';
import { PROVIDER_CREATION_LEASE_MINUTES } from '../../domain/billing-constants';
import { ChargeAlreadyExistsError } from '../../domain/errors/charge-already-exists.error';
import { ChargeConcurrentModificationError } from '../../domain/errors/charge-concurrent-modification.error';
import { RecoveryChargeAlreadyOpenError } from '../../domain/errors/recovery-charge-already-open.error';
import { ChargeLineEntity } from '../entities/charge-line.entity';
import { ChargeEntity } from '../entities/charge.entity';
import { TypeOrmChargeRepository } from './typeorm-charge.repository';

const TENANT = '0197a2b0-0000-7000-8000-0000000000aa';
const NOW = new Date('2026-03-02T12:00:00Z');

interface Mocks {
  manager: jest.Mocked<EntityManager>;
  executeUpdate: jest.Mock;
  set: jest.Mock;
  insertOrder: string[];
}

function mockManager(): Mocks {
  const insertOrder: string[] = [];
  const executeUpdate = jest.fn().mockResolvedValue({ affected: 1 });
  const set = jest.fn().mockReturnThis();
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set,
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: executeUpdate,
  };
  const manager = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockImplementation((entity: unknown) => {
      insertOrder.push(entity === ChargeEntity ? 'charge' : 'lines');
      return Promise.resolve();
    }),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    // runInNewTransaction sets a lock timeout through `query` before the work runs.
    query: jest.fn().mockResolvedValue(undefined),
    transaction: jest.fn(),
  } as unknown as jest.Mocked<EntityManager>;
  return { manager, executeUpdate, set, insertOrder };
}

describe('TypeOrmChargeRepository', () => {
  let mocks: Mocks;
  let repo: TypeOrmChargeRepository;

  const inTransaction = <T>(work: () => Promise<T>): Promise<T> =>
    runWithEntityManager(mocks.manager, work);

  beforeEach(() => {
    mocks = mockManager();
    repo = new TypeOrmChargeRepository({
      manager: mocks.manager,
    } as unknown as Repository<ChargeEntity>);
  });

  describe('reads', () => {
    it('findById maps the row and its lines, filtering both reads by tenant', async () => {
      const entity = new ChargeEntityBuilder().withTenantId(TENANT).withAmountMinor(15800).build();
      const lines = [
        new ChargeLineEntityBuilder().withChargeId(entity.id).withTenantId(TENANT).build(),
      ];
      mocks.manager.findOne.mockResolvedValueOnce(entity);
      mocks.manager.find.mockResolvedValueOnce(lines);

      const charge = await repo.findById(TENANT, entity.id);

      expect(charge?.id).toBe(entity.id);
      expect(charge?.amount.amountMinor).toBe(15800);
      expect(charge?.lines).toHaveLength(1);
      expect(mocks.manager.findOne).toHaveBeenCalledWith(
        ChargeEntity,
        expect.objectContaining({ where: { tenantId: TENANT, id: entity.id } }),
      );
      expect(mocks.manager.find).toHaveBeenCalledWith(
        ChargeLineEntity,
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
      );
    });

    it('findById answers null for a charge that does not exist, without reading lines', async () => {
      mocks.manager.findOne.mockResolvedValueOnce(null);

      expect(await repo.findById(TENANT, 'missing')).toBeNull();
      expect(mocks.manager.find).not.toHaveBeenCalled();
    });

    it('findByProviderChargeId keys on the tenant, the provider and the provider charge id', async () => {
      mocks.manager.findOne.mockResolvedValueOnce(null);

      await repo.findByProviderChargeId(TENANT, 'ASAAS', 'pay_1');

      expect(mocks.manager.findOne).toHaveBeenCalledWith(
        ChargeEntity,
        expect.objectContaining({
          where: { tenantId: TENANT, provider: 'ASAAS', providerChargeId: 'pay_1' },
        }),
      );
    });

    it('findOpenRecoveryBySubscription asks for the open recovery charge of that subscription', async () => {
      mocks.manager.findOne.mockResolvedValueOnce(null);

      await repo.findOpenRecoveryBySubscription(TENANT, 'sub-1');

      const where = mocks.manager.findOne.mock.calls[0]?.[1]?.where as Record<string, unknown>;
      expect(where).toMatchObject({ tenantId: TENANT, subscriptionId: 'sub-1', kind: 'RECOVERY' });
    });

    it('findOpenByTenant returns [] without a lines read when the tenant has none', async () => {
      mocks.manager.find.mockResolvedValueOnce([]);

      expect(await repo.findOpenByTenant(TENANT)).toEqual([]);
      expect(mocks.manager.find).toHaveBeenCalledTimes(1);
    });

    it('findOpenByTenant reads every charge’s lines in one query', async () => {
      const a = new ChargeEntityBuilder().withTenantId(TENANT).build();
      const b = new ChargeEntityBuilder().withTenantId(TENANT).build();
      mocks.manager.find
        .mockResolvedValueOnce([a, b])
        .mockResolvedValueOnce([
          new ChargeLineEntityBuilder().withTenantId(TENANT).withChargeId(a.id).build(),
          new ChargeLineEntityBuilder().withTenantId(TENANT).withChargeId(b.id).build(),
        ]);

      const charges = await repo.findOpenByTenant(TENANT);

      expect(charges.map((c) => c.lines.length)).toEqual([1, 1]);
      expect(mocks.manager.find).toHaveBeenCalledTimes(2);
    });

    it('listByTenantPage pages newest due date first and returns the total', async () => {
      const row = new ChargeEntityBuilder().withTenantId(TENANT).build();
      const getManyAndCount = jest.fn().mockResolvedValue([[row], 7]);
      const chain = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount,
      };
      mocks.manager.createQueryBuilder.mockReturnValueOnce(chain as never);
      mocks.manager.find.mockResolvedValueOnce([]);

      const page = await repo.listByTenantPage(TENANT, { limit: 5, offset: 10 });

      expect(page.total).toBe(7);
      expect(page.items).toHaveLength(1);
      expect(chain.where).toHaveBeenCalledWith('c.tenantId = :tenantId', { tenantId: TENANT });
      expect(chain.orderBy).toHaveBeenCalledWith('c.dueDate', 'DESC');
      expect(chain.addOrderBy).toHaveBeenCalledWith('c.id', 'DESC');
      expect(chain.take).toHaveBeenCalledWith(5);
      expect(chain.skip).toHaveBeenCalledWith(10);
    });
  });

  describe('findByIdForUpdate (B-C1)', () => {
    it('throws outside an active transaction', async () => {
      await expect(repo.findByIdForUpdate(TENANT, 'c-1')).rejects.toThrow(
        'findByIdForUpdate must be called inside an active transaction',
      );
    });

    it('takes a pessimistic write lock on the charge row inside a transaction', async () => {
      mocks.manager.findOne.mockResolvedValueOnce(null);

      await inTransaction(() => repo.findByIdForUpdate(TENANT, 'c-1'));

      expect(mocks.manager.findOne).toHaveBeenCalledWith(
        ChargeEntity,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    });
  });

  describe('save', () => {
    it('inserts a new charge, then its lines, and moves it to version 0', async () => {
      const charge = new ChargeBuilder()
        .withTenantId(TENANT)
        .withLines([new ChargeLineBuilder().build()])
        .withVersion(undefined)
        .build();

      await inTransaction(() => repo.save(charge));

      expect(mocks.insertOrder).toEqual(['charge', 'lines']);
      expect(charge.version).toBe(0);
    });

    it.each([
      ['UQ_billing_charges_period', ChargeAlreadyExistsError],
      ['UQ_billing_charges_open_recovery', RecoveryChargeAlreadyOpenError],
    ])('maps a %s violation to its typed error', async (constraint, ErrorClass) => {
      mocks.manager.insert.mockRejectedValueOnce(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('dup'), { code: '23505', constraint }),
        ),
      );
      const charge = new ChargeBuilder().withVersion(undefined).build();

      await expect(inTransaction(() => repo.save(charge))).rejects.toThrow(ErrorClass);
    });

    it('rethrows any other unique violation and any other failure untouched', async () => {
      const other = new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('dup'), { code: '23505', constraint: 'UQ_other' }),
      );
      mocks.manager.insert.mockRejectedValueOnce(other);

      await expect(
        inTransaction(() => repo.save(new ChargeBuilder().withVersion(undefined).build())),
      ).rejects.toBe(other);
    });

    it('updates a loaded charge under its version and moves it to the next one', async () => {
      const charge = new ChargeBuilder().withTenantId(TENANT).withVersion(3).build();
      charge.markOverdue();

      await inTransaction(() => repo.save(charge));

      expect(mocks.executeUpdate).toHaveBeenCalledTimes(1);
      expect(mocks.insertOrder).toEqual([]);
      expect(charge.version).toBe(4);
    });

    it('never writes the claim columns, the lines, the amounts or the identity on an update', async () => {
      const charge = new ChargeBuilder().withVersion(1).withCreationAttempts(2, NOW).build();
      charge.markOverdue();

      await inTransaction(() => repo.save(charge));

      const written = Object.keys(mocks.set.mock.calls[0]?.[0] as object);
      const immutable = [
        'providerCreationAttempts',
        'providerCreationLastAttemptAt',
        'id',
        'tenantId',
        'subscriptionId',
        'kind',
        'periodStart',
        'periodEnd',
        'dueDate',
        'subtotalMinor',
        'amountMinor',
        'currency',
        'merchantProfileKey',
      ];
      for (const column of immutable) {
        expect(written).not.toContain(column);
      }
      expect(written).toEqual(expect.arrayContaining(['status', 'version', 'updatedAt']));
    });

    it('throws ChargeConcurrentModificationError when the row moved under it', async () => {
      mocks.executeUpdate.mockResolvedValueOnce({ affected: 0 });
      const charge = new ChargeBuilder().withVersion(1).build();

      await expect(inTransaction(() => repo.save(charge))).rejects.toThrow(
        ChargeConcurrentModificationError,
      );
      expect(charge.version).toBe(1);
    });
  });

  describe('claimForProviderCreation', () => {
    it.each([
      ['plain rows', [{ id: 'c-1' }]],
      ['the [rows, rowCount] shape', [[{ id: 'c-1' }], 1]],
    ])('owns the creation when the UPDATE returns a row (%s)', async (_n, result) => {
      mocks.manager.query.mockResolvedValueOnce(result);

      expect(await repo.claimForProviderCreation(TENANT, 'c-1', NOW)).toBe(true);
    });

    it.each([
      ['no rows', []],
      ['the [rows, rowCount] shape with no rows', [[], 0]],
    ])('is not the owner when nothing was updated (%s)', async (_n, result) => {
      mocks.manager.query.mockResolvedValueOnce(result);

      expect(await repo.claimForProviderCreation(TENANT, 'c-1', NOW)).toBe(false);
    });

    it('passes the tenant, the charge, the caller’s clock instant and the lease length', async () => {
      mocks.manager.query.mockResolvedValueOnce([]);

      await repo.claimForProviderCreation(TENANT, 'c-1', NOW);

      expect(mocks.manager.query).toHaveBeenCalledWith(expect.stringContaining('SKIP LOCKED'), [
        TENANT,
        'c-1',
        NOW,
        PROVIDER_CREATION_LEASE_MINUTES,
      ]);
    });

    it('only claims an open charge: a cancelled or paid one never gets a provider bill', async () => {
      mocks.manager.query.mockResolvedValueOnce([]);

      await repo.claimForProviderCreation(TENANT, 'c-1', NOW);

      expect(mocks.manager.query.mock.calls[0]?.[0]).toContain(
        `"status" IN ('PENDING', 'OVERDUE')`,
      );
    });

    it('runs on the repository’s own manager, never the caller’s transaction', async () => {
      const own = mockManager();
      own.manager.query.mockResolvedValueOnce([]);
      const claimRepo = new TypeOrmChargeRepository({
        manager: own.manager,
      } as unknown as Repository<ChargeEntity>);

      await inTransaction(() => claimRepo.claimForProviderCreation(TENANT, 'c-1', NOW));

      expect(own.manager.query).toHaveBeenCalledTimes(1);
      expect(mocks.manager.query).not.toHaveBeenCalled();
    });
  });
});
