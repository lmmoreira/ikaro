import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { FutureCommitmentExceptionBuilder } from '../../../../test/builders/booking/index';
import { FutureCommitmentExceptionEntityBuilder } from '../../../../test/builders/booking/index';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import { FutureCommitmentExceptionEntity } from '../entities/future-commitment-exception.entity';
import { TypeOrmFutureCommitmentExceptionRepository } from './typeorm-future-commitment-exception.repository';

const TENANT_ID = '00000000-0000-7000-8000-000000000301';

describe('TypeOrmFutureCommitmentExceptionRepository', () => {
  let repo: TypeOrmFutureCommitmentExceptionRepository;
  let ormRepo: jest.Mocked<Repository<FutureCommitmentExceptionEntity>>;
  let outbox: { publish: jest.Mock };
  let manager: { save: jest.Mock; findOne: jest.Mock; find: jest.Mock; getRepository: jest.Mock };

  beforeEach(async () => {
    outbox = { publish: jest.fn().mockResolvedValue(undefined) };
    manager = {
      save: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      find: jest.fn(),
      getRepository: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmFutureCommitmentExceptionRepository,
        {
          provide: getRepositoryToken(FutureCommitmentExceptionEntity),
          useValue: { findOne: jest.fn(), find: jest.fn(), count: jest.fn(), manager: {} },
        },
        { provide: OUTBOX_PUBLISHER, useValue: outbox },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmFutureCommitmentExceptionRepository);
    ormRepo = moduleRef.get(getRepositoryToken(FutureCommitmentExceptionEntity));
  });

  const inTransaction = <T>(work: () => Promise<T>) =>
    runWithEntityManager(manager as unknown as EntityManager, work);

  describe('findById', () => {
    it('maps the row to the aggregate, scoped by tenant', async () => {
      const entity = new FutureCommitmentExceptionEntityBuilder().withTenantId(TENANT_ID).build();
      ormRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findById(entity.id, TENANT_ID);

      expect(ormRepo.findOne).toHaveBeenCalledWith({
        where: { id: entity.id, tenantId: TENANT_ID },
      });
      expect(result?.id).toBe(entity.id);
      expect(result?.status).toBe('OPEN');
    });

    it('returns null when there is no such row', async () => {
      ormRepo.findOne.mockResolvedValue(null);

      await expect(repo.findById('missing', TENANT_ID)).resolves.toBeNull();
    });
  });

  describe('findByIdForUpdate', () => {
    it('refuses to run outside an active transaction', async () => {
      await expect(repo.findByIdForUpdate('id', TENANT_ID)).rejects.toThrow('active transaction');
    });

    it('takes a pessimistic write lock through the ambient manager', async () => {
      const entity = new FutureCommitmentExceptionEntityBuilder().withTenantId(TENANT_ID).build();
      manager.findOne.mockResolvedValue(entity);

      const result = await inTransaction(() => repo.findByIdForUpdate(entity.id, TENANT_ID));

      expect(manager.findOne).toHaveBeenCalledWith(FutureCommitmentExceptionEntity, {
        where: { id: entity.id, tenantId: TENANT_ID },
        lock: { mode: 'pessimistic_write' },
      });
      expect(result?.id).toBe(entity.id);
    });

    it('returns null when the row is gone', async () => {
      manager.findOne.mockResolvedValue(null);

      await expect(
        inTransaction(() => repo.findByIdForUpdate('missing', TENANT_ID)),
      ).resolves.toBeNull();
    });
  });

  describe('findOpenBySourceForUpdate', () => {
    const SOURCE_ID = '00000000-0000-7000-8000-0000000000a1';

    it('refuses to run outside an active transaction', async () => {
      await expect(
        repo.findOpenBySourceForUpdate(TENANT_ID, 'RESOURCE_DEACTIVATION', SOURCE_ID),
      ).rejects.toThrow('active transaction');
    });

    it('locks only the OPEN rows of that source, tenant-scoped and ordered by id', async () => {
      const entities = [
        new FutureCommitmentExceptionEntityBuilder().withTenantId(TENANT_ID).build(),
        new FutureCommitmentExceptionEntityBuilder().withTenantId(TENANT_ID).build(),
      ];
      manager.find.mockResolvedValue(entities);

      const result = await inTransaction(() =>
        repo.findOpenBySourceForUpdate(TENANT_ID, 'RESOURCE_DEACTIVATION', SOURCE_ID),
      );

      expect(manager.find).toHaveBeenCalledWith(FutureCommitmentExceptionEntity, {
        where: {
          tenantId: TENANT_ID,
          sourceType: 'RESOURCE_DEACTIVATION',
          sourceId: SOURCE_ID,
          status: 'OPEN',
        },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(result.map((e) => e.id)).toEqual(entities.map((e) => e.id));
    });

    it('returns an empty list when nothing is open', async () => {
      manager.find.mockResolvedValue([]);

      await expect(
        inTransaction(() =>
          repo.findOpenBySourceForUpdate(TENANT_ID, 'RESOURCE_DEACTIVATION', SOURCE_ID),
        ),
      ).resolves.toEqual([]);
    });
  });

  describe('findOpenByImpact', () => {
    const impact = {
      sourceType: 'RESOURCE_DEACTIVATION' as const,
      sourceId: '00000000-0000-7000-8000-0000000000a1',
      affectedType: 'BOOKING' as const,
      affectedId: '00000000-0000-7000-8000-0000000000b1',
    };

    it('looks only at the OPEN row of the exact impact, tenant-scoped', async () => {
      ormRepo.findOne.mockResolvedValue(null);

      await repo.findOpenByImpact(TENANT_ID, impact);

      expect(ormRepo.findOne).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, ...impact, status: 'OPEN' },
      });
    });

    it('reads through the ambient transaction so a sibling raise in the same transaction is seen', async () => {
      const txRepo = { findOne: jest.fn().mockResolvedValue(null) };
      manager.getRepository.mockReturnValue(txRepo);

      await inTransaction(() => repo.findOpenByImpact(TENANT_ID, impact));

      expect(manager.getRepository).toHaveBeenCalledWith(FutureCommitmentExceptionEntity);
      expect(txRepo.findOne).toHaveBeenCalled();
      expect(ormRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('countByTenant', () => {
    it('counts by tenant and status without loading rows', async () => {
      ormRepo.count.mockResolvedValue(3);

      const result = await repo.countByTenant(TENANT_ID, { status: 'OPEN' });

      expect(result).toBe(3);
      expect(ormRepo.count).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, status: 'OPEN' },
      });
      expect(ormRepo.find).not.toHaveBeenCalled();
    });

    it('omits the status predicate when none is given', async () => {
      ormRepo.count.mockResolvedValue(0);

      await repo.countByTenant(TENANT_ID);

      expect(ormRepo.count).toHaveBeenCalledWith({ where: { tenantId: TENANT_ID } });
    });
  });

  describe('findByTenant', () => {
    it('filters by tenant and status, newest first with an id tie-breaker', async () => {
      ormRepo.find.mockResolvedValue([]);

      await repo.findByTenant(TENANT_ID, { status: 'OPEN' });

      expect(ormRepo.find).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, status: 'OPEN' },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
    });

    it('omits the status predicate when none is given', async () => {
      ormRepo.find.mockResolvedValue([
        new FutureCommitmentExceptionEntityBuilder().withTenantId(TENANT_ID).build(),
      ]);

      const result = await repo.findByTenant(TENANT_ID);

      expect(ormRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_ID } }),
      );
      expect(result).toHaveLength(1);
    });

    it('adds the affected-row predicates when asked for one booking’s entries (M23-S46)', async () => {
      ormRepo.find.mockResolvedValue([]);

      await repo.findByTenant(TENANT_ID, {
        status: 'OPEN',
        affectedType: 'BOOKING',
        affectedId: 'booking-1',
      });

      expect(ormRepo.find).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          status: 'OPEN',
          affectedType: 'BOOKING',
          affectedId: 'booking-1',
        },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
    });
  });

  describe('findOpenAffectedBookingIds (M23-S46)', () => {
    it('returns an empty set without querying for an empty input', async () => {
      const result = await repo.findOpenAffectedBookingIds(TENANT_ID, []);

      expect(result.size).toBe(0);
      expect(ormRepo.find).not.toHaveBeenCalled();
    });

    it('reads only the OPEN BOOKING entries of the tenant for the given ids, in one query', async () => {
      ormRepo.find.mockResolvedValue([
        new FutureCommitmentExceptionEntityBuilder()
          .withTenantId(TENANT_ID)
          .withAffectedId('booking-1')
          .build(),
      ]);

      const result = await repo.findOpenAffectedBookingIds(TENANT_ID, ['booking-1', 'booking-2']);

      expect(ormRepo.find).toHaveBeenCalledTimes(1);
      const arg = ormRepo.find.mock.calls[0][0] as {
        select: unknown;
        where: Record<string, unknown>;
      };
      expect(arg.select).toEqual({ affectedId: true });
      expect(arg.where).toMatchObject({
        tenantId: TENANT_ID,
        status: 'OPEN',
        affectedType: 'BOOKING',
      });
      expect([...result]).toEqual(['booking-1']);
    });
  });

  describe('save', () => {
    it('writes the row and drains the aggregate events to the outbox in the ambient transaction', async () => {
      const exception = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_ID).build();

      await inTransaction(() => repo.save(exception));

      expect(manager.save).toHaveBeenCalledWith(
        FutureCommitmentExceptionEntity,
        expect.objectContaining({ id: exception.id, tenantId: TENANT_ID, status: 'OPEN' }),
      );
      expect(outbox.publish).toHaveBeenCalledTimes(1);
      expect(exception.clearDomainEvents()).toHaveLength(0);
    });

    it('opens its own transaction when the caller has none', async () => {
      const exception = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_ID).build();
      const transaction = jest.fn((work: (m: EntityManager) => Promise<unknown>) =>
        work(manager as unknown as EntityManager),
      );
      (ormRepo as unknown as { manager: unknown }).manager = { transaction };

      await repo.save(exception);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalled();
    });
  });
});
