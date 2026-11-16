import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { BalanceExpiryLogEntityBuilder } from '../../../../test/builders/loyalty/index';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { BalanceExpiryLogEntity } from '../entities/balance-expiry-log.entity';
import { TypeOrmBalanceExpiryLogRepository } from './typeorm-balance-expiry-log.repository';

describe('TypeOrmBalanceExpiryLogRepository', () => {
  let repo: TypeOrmBalanceExpiryLogRepository;
  let ormRepo: jest.Mocked<Repository<BalanceExpiryLogEntity>>;
  let insertBuilder: Record<'insert' | 'into' | 'values' | 'orIgnore' | 'execute', jest.Mock>;

  beforeEach(async () => {
    insertBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmBalanceExpiryLogRepository,
        {
          provide: getRepositoryToken(BalanceExpiryLogEntity),
          useValue: {
            find: jest.fn(),
            manager: { createQueryBuilder: jest.fn(() => insertBuilder) },
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmBalanceExpiryLogRepository);
    ormRepo = moduleRef.get(getRepositoryToken(BalanceExpiryLogEntity));
  });

  describe('findProcessedEntryIds()', () => {
    it('returns an empty set without querying when no ids are given', async () => {
      expect(await repo.findProcessedEntryIds([])).toEqual(new Set());
      expect(ormRepo.find).not.toHaveBeenCalled();
    });

    it('returns only the ids that have a log row', async () => {
      const processed = uuidv7();
      const pending = uuidv7();
      ormRepo.find.mockResolvedValue([
        new BalanceExpiryLogEntityBuilder().withEntryId(processed).build(),
      ]);

      const result = await repo.findProcessedEntryIds([processed, pending]);

      expect(result).toEqual(new Set([processed]));
    });

    it('reads on the ambient transaction manager, not a second pooled connection', async () => {
      const processed = uuidv7();
      const mockManager = {
        find: jest
          .fn()
          .mockResolvedValue([new BalanceExpiryLogEntityBuilder().withEntryId(processed).build()]),
      } as unknown as jest.Mocked<EntityManager>;

      const result = await runWithEntityManager(mockManager, () =>
        repo.findProcessedEntryIds([processed]),
      );

      expect(result).toEqual(new Set([processed]));
      expect(mockManager.find).toHaveBeenCalledWith(BalanceExpiryLogEntity, expect.anything());
      expect(ormRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('markProcessedMany()', () => {
    it('does nothing for an empty list', async () => {
      await repo.markProcessedMany([]);

      expect(ormRepo.manager.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('writes one row per entry in a single insert that ignores conflicts', async () => {
      const first = uuidv7();
      const second = uuidv7();

      await repo.markProcessedMany([first, second]);

      expect(insertBuilder.into).toHaveBeenCalledWith(BalanceExpiryLogEntity);
      expect(insertBuilder.values).toHaveBeenCalledWith([{ entryId: first }, { entryId: second }]);
      expect(insertBuilder.orIgnore).toHaveBeenCalledTimes(1);
      expect(insertBuilder.execute).toHaveBeenCalledTimes(1);
    });

    it('writes on the ambient transaction manager, not a second pooled connection', async () => {
      const mockManager = {
        createQueryBuilder: jest.fn(() => insertBuilder),
      } as unknown as jest.Mocked<EntityManager>;

      await runWithEntityManager(mockManager, () => repo.markProcessedMany([uuidv7()]));

      expect(mockManager.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(ormRepo.manager.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
