import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  LoyaltyBalanceBuilder,
  LoyaltyBalanceEntityBuilder,
} from '../../../../test/builders/loyalty/index';
import { LoyaltyBalance } from '../../domain/loyalty-balance.aggregate';
import { LoyaltyBalanceEntity } from '../entities/loyalty-balance.entity';
import { TypeOrmLoyaltyBalanceRepository } from './typeorm-loyalty-balance.repository';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000002';

describe('TypeOrmLoyaltyBalanceRepository', () => {
  let repo: TypeOrmLoyaltyBalanceRepository;
  let ormRepo: jest.Mocked<Repository<LoyaltyBalanceEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmLoyaltyBalanceRepository,
        {
          provide: getRepositoryToken(LoyaltyBalanceEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            upsert: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmLoyaltyBalanceRepository);
    ormRepo = moduleRef.get(getRepositoryToken(LoyaltyBalanceEntity));
  });

  describe('findByCustomer()', () => {
    it('returns null when no balance row exists', async () => {
      ormRepo.findOne.mockResolvedValue(null);
      const result = await repo.findByCustomer(TENANT_ID, CUSTOMER_ID);
      expect(result).toBeNull();
    });

    it('maps entity to LoyaltyBalance domain object', async () => {
      ormRepo.findOne.mockResolvedValue(
        new LoyaltyBalanceEntityBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(CUSTOMER_ID)
          .withCurrentPoints(50)
          .build(),
      );

      const result = await repo.findByCustomer(TENANT_ID, CUSTOMER_ID);

      expect(result).toBeInstanceOf(LoyaltyBalance);
      expect(result!.currentPoints).toBe(50);
    });
  });

  describe('row-locking reads', () => {
    const entity = () =>
      new LoyaltyBalanceEntityBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(70)
        .build();

    function managerWith(findOne: jest.Mock) {
      const execute = jest.fn().mockResolvedValue(undefined);
      const orIgnore = jest.fn().mockReturnValue({ execute });
      const values = jest.fn().mockReturnValue({ orIgnore });
      const into = jest.fn().mockReturnValue({ values });
      const insert = jest.fn().mockReturnValue({ into });
      const manager = {
        findOne,
        createQueryBuilder: jest.fn().mockReturnValue({ insert }),
      } as unknown as jest.Mocked<EntityManager>;
      return { manager, into, values, orIgnore, execute };
    }

    it('findByCustomerForUpdate throws outside a transaction', async () => {
      await expect(repo.findByCustomerForUpdate(TENANT_ID, CUSTOMER_ID)).rejects.toThrow(
        'must be called inside an active transaction',
      );
    });

    it('findOrCreateByCustomerForUpdate throws outside a transaction', async () => {
      await expect(repo.findOrCreateByCustomerForUpdate(TENANT_ID, CUSTOMER_ID)).rejects.toThrow(
        'must be called inside an active transaction',
      );
    });

    it('findByCustomerForUpdate takes a pessimistic write lock scoped to the tenant', async () => {
      const findOne = jest.fn().mockResolvedValue(entity());
      const { manager } = managerWith(findOne);

      const result = await runWithEntityManager(manager, () =>
        repo.findByCustomerForUpdate(TENANT_ID, CUSTOMER_ID),
      );

      expect(result!.currentPoints).toBe(70);
      expect(findOne).toHaveBeenCalledWith(LoyaltyBalanceEntity, {
        where: { tenantId: TENANT_ID, customerId: CUSTOMER_ID },
        lock: { mode: 'pessimistic_write' },
      });
      expect(ormRepo.findOne).not.toHaveBeenCalled();
    });

    it('findByCustomerForUpdate returns null when no row exists', async () => {
      const { manager } = managerWith(jest.fn().mockResolvedValue(null));

      const result = await runWithEntityManager(manager, () =>
        repo.findByCustomerForUpdate(TENANT_ID, CUSTOMER_ID),
      );

      expect(result).toBeNull();
    });

    it('findOrCreateByCustomerForUpdate issues one lock query when the row exists', async () => {
      const findOne = jest.fn().mockResolvedValue(entity());
      const { manager, execute } = managerWith(findOne);

      const result = await runWithEntityManager(manager, () =>
        repo.findOrCreateByCustomerForUpdate(TENANT_ID, CUSTOMER_ID),
      );

      expect(result.currentPoints).toBe(70);
      expect(findOne).toHaveBeenCalledTimes(1);
      expect(execute).not.toHaveBeenCalled();
    });

    it('findOrCreateByCustomerForUpdate inserts (ignoring a conflict) then locks on a miss', async () => {
      const findOne = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(TENANT_ID)
            .withCustomerId(CUSTOMER_ID)
            .withCurrentPoints(0)
            .build(),
        );
      const { manager, into, values, orIgnore, execute } = managerWith(findOne);

      const result = await runWithEntityManager(manager, () =>
        repo.findOrCreateByCustomerForUpdate(TENANT_ID, CUSTOMER_ID),
      );

      expect(result.currentPoints).toBe(0);
      expect(into).toHaveBeenCalledWith(LoyaltyBalanceEntity);
      expect(values).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        currentPoints: 0,
      });
      expect(orIgnore).toHaveBeenCalled();
      expect(execute).toHaveBeenCalledTimes(1);
      expect(findOne).toHaveBeenCalledTimes(2);
      expect(findOne).toHaveBeenLastCalledWith(
        LoyaltyBalanceEntity,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    });
  });

  describe('findManyByCustomers()', () => {
    it('returns an empty array without querying when customerIds is empty', async () => {
      const result = await repo.findManyByCustomers(TENANT_ID, []);

      expect(result).toEqual([]);
      expect(ormRepo.find).not.toHaveBeenCalled();
    });

    it('maps each found entity to a LoyaltyBalance domain object', async () => {
      const customerId2 = '00000000-0000-7000-8000-000000000003';
      ormRepo.find.mockResolvedValue([
        new LoyaltyBalanceEntityBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(CUSTOMER_ID)
          .withCurrentPoints(50)
          .build(),
        new LoyaltyBalanceEntityBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(customerId2)
          .withCurrentPoints(10)
          .build(),
      ]);

      const result = await repo.findManyByCustomers(TENANT_ID, [CUSTOMER_ID, customerId2]);

      expect(result).toHaveLength(2);
      expect(result.every((b) => b instanceof LoyaltyBalance)).toBe(true);
      expect(result.map((b) => b.currentPoints)).toEqual([50, 10]);
    });
  });

  describe('findManyByTenantCustomerPairs()', () => {
    it('returns an empty array without querying when pairs is empty', async () => {
      const result = await repo.findManyByTenantCustomerPairs([]);

      expect(result).toEqual([]);
      expect(ormRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('maps each found entity to a LoyaltyBalance domain object', async () => {
      const tenantId2 = '00000000-0000-7000-8000-000000000004';
      const customerId2 = '00000000-0000-7000-8000-000000000003';
      const getMany = jest
        .fn()
        .mockResolvedValue([
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(TENANT_ID)
            .withCustomerId(CUSTOMER_ID)
            .withCurrentPoints(50)
            .build(),
          new LoyaltyBalanceEntityBuilder()
            .withTenantId(tenantId2)
            .withCustomerId(customerId2)
            .withCurrentPoints(10)
            .build(),
        ]);
      const where = jest.fn().mockReturnValue({ getMany });
      ormRepo.createQueryBuilder.mockReturnValue({ where } as never);

      const result = await repo.findManyByTenantCustomerPairs([
        { tenantId: TENANT_ID, customerId: CUSTOMER_ID },
        { tenantId: tenantId2, customerId: customerId2 },
      ]);

      expect(ormRepo.createQueryBuilder).toHaveBeenCalledWith('balance');
      expect(result).toHaveLength(2);
      expect(result.every((b) => b instanceof LoyaltyBalance)).toBe(true);
      expect(result.map((b) => b.currentPoints)).toEqual([50, 10]);
    });
  });

  describe('upsert()', () => {
    it('delegates to ormRepo.upsert with mapped entity', async () => {
      ormRepo.upsert.mockResolvedValue({ raw: [], generatedMaps: [], identifiers: [] });
      const balance = new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(30)
        .build();

      await repo.upsert(balance);

      expect(ormRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          customerId: CUSTOMER_ID,
          currentPoints: 30,
        }),
        ['tenantId', 'customerId'],
      );
    });
  });
});
