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

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmBalanceExpiryLogRepository,
        {
          provide: getRepositoryToken(BalanceExpiryLogEntity),
          useValue: {
            count: jest.fn(),
            find: jest.fn(),
            upsert: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmBalanceExpiryLogRepository);
    ormRepo = moduleRef.get(getRepositoryToken(BalanceExpiryLogEntity));
  });

  describe('hasBeenProcessed()', () => {
    it('returns false when entry has not been processed', async () => {
      ormRepo.count.mockResolvedValue(0);
      expect(await repo.hasBeenProcessed(uuidv7())).toBe(false);
    });

    it('returns true when entry has been processed', async () => {
      ormRepo.count.mockResolvedValue(1);
      expect(await repo.hasBeenProcessed(uuidv7())).toBe(true);
    });
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

  describe('markProcessed()', () => {
    it('upserts an expiry log entity with the given entryId', async () => {
      ormRepo.upsert.mockResolvedValue({ raw: [], generatedMaps: [], identifiers: [] });
      const entryId = uuidv7();

      await repo.markProcessed(entryId);

      expect(ormRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({ entryId }), [
        'entryId',
      ]);
    });
  });
});
