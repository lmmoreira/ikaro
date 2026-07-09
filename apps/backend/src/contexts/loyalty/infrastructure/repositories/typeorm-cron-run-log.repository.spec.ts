import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CronRunLogEntity } from '../entities/cron-run-log.entity';
import { TypeOrmCronRunLogRepository } from './typeorm-cron-run-log.repository';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CRON_DATE = '2026-06-01';
const REMINDER_TYPE = 'loyalty-expire-points';

describe('TypeOrmCronRunLogRepository', () => {
  let repo: TypeOrmCronRunLogRepository;
  let ormRepo: jest.Mocked<Repository<CronRunLogEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmCronRunLogRepository,
        {
          provide: getRepositoryToken(CronRunLogEntity),
          useValue: {
            count: jest.fn(),
            upsert: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmCronRunLogRepository);
    ormRepo = moduleRef.get(getRepositoryToken(CronRunLogEntity));
  });

  describe('hasRun()', () => {
    it('returns false when no run has been recorded', async () => {
      ormRepo.count.mockResolvedValue(0);
      expect(await repo.hasRun(TENANT_ID, CRON_DATE, REMINDER_TYPE)).toBe(false);
    });

    it('returns true when a run has been recorded', async () => {
      ormRepo.count.mockResolvedValue(1);
      expect(await repo.hasRun(TENANT_ID, CRON_DATE, REMINDER_TYPE)).toBe(true);
      expect(ormRepo.count).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, cronDate: CRON_DATE, reminderType: REMINDER_TYPE },
      });
    });
  });

  describe('markRun()', () => {
    it('upserts a cron-run-log entity with the given key, conflicting on all three columns', async () => {
      ormRepo.upsert.mockResolvedValue({ raw: [], generatedMaps: [], identifiers: [] });

      await repo.markRun(TENANT_ID, CRON_DATE, REMINDER_TYPE);

      expect(ormRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          cronDate: CRON_DATE,
          reminderType: REMINDER_TYPE,
        }),
        ['tenantId', 'cronDate', 'reminderType'],
      );
    });
  });
});
