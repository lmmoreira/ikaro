import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
