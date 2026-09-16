import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';
import { TypeOrmBookingAvailabilityAdapter } from './typeorm-booking-availability.adapter';

function buildQueryBuilder(rows: { resourceId: string; startsAt: string; endsAt: string }[]) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
  return qb;
}

describe('TypeOrmBookingAvailabilityAdapter', () => {
  let adapter: TypeOrmBookingAvailabilityAdapter;
  let ormRepo: jest.Mocked<Repository<ResourceOccupancyEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmBookingAvailabilityAdapter,
        {
          provide: getRepositoryToken(ResourceOccupancyEntity),
          useValue: { createQueryBuilder: jest.fn() },
        },
      ],
    }).compile();

    adapter = moduleRef.get(TypeOrmBookingAvailabilityAdapter);
    ormRepo = moduleRef.get(getRepositoryToken(ResourceOccupancyEntity));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('findOccupancyByTenantAndResource', () => {
    it('returns [] without querying when no resourceIds are given', async () => {
      const result = await adapter.findOccupancyByTenantAndResource(
        'tenant-1',
        [],
        '2026-06-01',
        '2026-06-01',
      );

      expect(result).toEqual([]);
      expect(ormRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns [] when no occupancy rows exist for the resource on that date', async () => {
      ormRepo.createQueryBuilder.mockReturnValue(buildQueryBuilder([]) as never);

      const result = await adapter.findOccupancyByTenantAndResource(
        'tenant-1',
        ['resource-1'],
        '2026-06-01',
        '2026-06-01',
      );

      expect(result).toEqual([]);
    });

    it('maps occupancy rows to ResourceOccupiedSlot', async () => {
      const rows = [
        {
          resourceId: 'resource-1',
          startsAt: '2026-06-01T10:00:00.000Z',
          endsAt: '2026-06-01T11:00:00.000Z',
        },
      ];
      ormRepo.createQueryBuilder.mockReturnValue(buildQueryBuilder(rows) as never);

      const result = await adapter.findOccupancyByTenantAndResource(
        'tenant-1',
        ['resource-1'],
        '2026-06-01',
        '2026-06-01',
      );

      expect(result).toEqual([
        {
          resourceId: 'resource-1',
          startsAt: new Date('2026-06-01T10:00:00.000Z'),
          endsAt: new Date('2026-06-01T11:00:00.000Z'),
        },
      ]);
    });

    it('uses the active transaction repository when one exists', async () => {
      const managerQb = buildQueryBuilder([]);
      const managerRepo = { createQueryBuilder: jest.fn().mockReturnValue(managerQb) };
      const manager = {
        getRepository: jest.fn().mockReturnValue(managerRepo),
      } as unknown as EntityManager;

      await runWithEntityManager(manager, () =>
        adapter.findOccupancyByTenantAndResource(
          'tenant-1',
          ['resource-1'],
          '2026-06-01',
          '2026-06-01',
        ),
      );

      expect(manager.getRepository).toHaveBeenCalledWith(ResourceOccupancyEntity);
      expect(managerRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(ormRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns multiple occupied slots across multiple resources', async () => {
      const rows = [
        {
          resourceId: 'resource-1',
          startsAt: '2026-06-02T09:00:00.000Z',
          endsAt: '2026-06-02T09:30:00.000Z',
        },
        {
          resourceId: 'resource-2',
          startsAt: '2026-06-05T14:00:00.000Z',
          endsAt: '2026-06-05T14:45:00.000Z',
        },
      ];
      ormRepo.createQueryBuilder.mockReturnValue(buildQueryBuilder(rows) as never);

      const result = await adapter.findOccupancyByTenantAndResource(
        'tenant-1',
        ['resource-1', 'resource-2'],
        '2026-06-01',
        '2026-06-07',
      );

      expect(result).toHaveLength(2);
      expect(result[0].resourceId).toBe('resource-1');
      expect(result[1].resourceId).toBe('resource-2');
    });
  });
});
