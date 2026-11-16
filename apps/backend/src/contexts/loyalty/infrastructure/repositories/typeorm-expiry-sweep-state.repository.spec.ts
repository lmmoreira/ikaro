import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExpirySweepStateEntityBuilder } from '../../../../test/builders/loyalty/index';
import { ExpirySweepStateEntity } from '../entities/expiry-sweep-state.entity';
import {
  EXPIRY_SWEEP_JOB_NAME,
  TypeOrmExpirySweepStateRepository,
} from './typeorm-expiry-sweep-state.repository';

describe('TypeOrmExpirySweepStateRepository', () => {
  let repo: TypeOrmExpirySweepStateRepository;
  let ormRepo: jest.Mocked<Repository<ExpirySweepStateEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmExpirySweepStateRepository,
        {
          provide: getRepositoryToken(ExpirySweepStateEntity),
          useValue: { findOne: jest.fn(), query: jest.fn() },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmExpirySweepStateRepository);
    ormRepo = moduleRef.get(getRepositoryToken(ExpirySweepStateEntity));
  });

  describe('getProcessedThrough()', () => {
    it('returns null when no watermark row exists', async () => {
      ormRepo.findOne.mockResolvedValue(null);

      expect(await repo.getProcessedThrough()).toBeNull();
      expect(ormRepo.findOne).toHaveBeenCalledWith({
        where: { jobName: EXPIRY_SWEEP_JOB_NAME },
      });
    });

    it('returns the stored instant', async () => {
      const stored = new Date('2026-11-15T02:00:00.000Z');
      ormRepo.findOne.mockResolvedValue(
        new ExpirySweepStateEntityBuilder().withProcessedThrough(stored).build(),
      );

      expect(await repo.getProcessedThrough()).toEqual(stored);
    });
  });

  describe('advanceTo()', () => {
    it('upserts the single row keeping the greater of the stored and the new instant', async () => {
      const next = new Date('2026-11-16T02:00:00.000Z');

      await repo.advanceTo(next);

      const [sql, params] = (ormRepo.query as jest.Mock).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('ON CONFLICT (job_name) DO UPDATE');
      expect(sql).toContain('GREATEST');
      expect(params).toEqual([EXPIRY_SWEEP_JOB_NAME, next]);
    });
  });
});
