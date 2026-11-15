import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LoyaltyEntryBuilder,
  LoyaltyEntryEntityBuilder,
} from '../../../../test/builders/loyalty/index';
import { LoyaltyEntry } from '../../domain/loyalty-entry.aggregate';
import { LoyaltyEntryEntity } from '../entities/loyalty-entry.entity';
import { TypeOrmLoyaltyEntryRepository } from './typeorm-loyalty-entry.repository';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

describe('TypeOrmLoyaltyEntryRepository', () => {
  let repo: TypeOrmLoyaltyEntryRepository;
  let ormRepo: jest.Mocked<Repository<LoyaltyEntryEntity>>;

  function mockQueryBuilder(entities: LoyaltyEntryEntity[]) {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(entities),
    };
    (ormRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
    return qb;
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmLoyaltyEntryRepository,
        {
          provide: getRepositoryToken(LoyaltyEntryEntity),
          useValue: {
            save: jest.fn(),
            exists: jest.fn(),
            find: jest.fn(),
            findAndCount: jest.fn(),
            query: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmLoyaltyEntryRepository);
    ormRepo = moduleRef.get(getRepositoryToken(LoyaltyEntryEntity));
  });

  describe('save()', () => {
    it('delegates to ormRepo.save with mapped entity', async () => {
      ormRepo.save.mockResolvedValue(
        new LoyaltyEntryEntityBuilder().withTenantId(TENANT_ID).build(),
      );
      const entry = new LoyaltyEntryBuilder().withTenantId(TENANT_ID).build();

      await repo.save(entry);

      expect(ormRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_ID }));
    });
  });

  describe('existsById()', () => {
    it('returns true when the entry exists', async () => {
      (ormRepo.exists as jest.Mock).mockResolvedValue(true);

      const result = await repo.existsById('entry-id');

      expect(result).toBe(true);
      expect(ormRepo.exists).toHaveBeenCalledWith({ where: { id: 'entry-id' } });
    });

    it('returns false when the entry does not exist', async () => {
      (ormRepo.exists as jest.Mock).mockResolvedValue(false);

      const result = await repo.existsById('entry-id');

      expect(result).toBe(false);
    });
  });

  describe('findByCustomerPaginated()', () => {
    it('returns paginated items and total', async () => {
      const entity = new LoyaltyEntryEntityBuilder().withTenantId(TENANT_ID).build();
      (ormRepo.findAndCount as jest.Mock).mockResolvedValue([[entity], 1]);

      const result = await repo.findByCustomerPaginated(TENANT_ID, 'customer-id', 1, 20);

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toBeInstanceOf(LoyaltyEntry);
    });

    it('returns empty list when no entries found', async () => {
      (ormRepo.findAndCount as jest.Mock).mockResolvedValue([[], 0]);

      const result = await repo.findByCustomerPaginated(TENANT_ID, 'customer-id', 1, 20);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('findUnprocessedByCustomer()', () => {
    it('returns the customer entries the expiry sweep has not processed, scoped by tenant', async () => {
      const qb = mockQueryBuilder([
        new LoyaltyEntryEntityBuilder().withTenantId(TENANT_ID).build(),
      ]);

      const result = await repo.findUnprocessedByCustomer(TENANT_ID, 'customer-id');

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(LoyaltyEntry);
      expect(qb.where).toHaveBeenCalledWith(
        'e.tenantId = :tenantId AND e.customerId = :customerId',
        { tenantId: TENANT_ID, customerId: 'customer-id' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('balance_expiry_log'));
    });

    it('returns an empty array when the customer has no entries', async () => {
      mockQueryBuilder([]);

      expect(await repo.findUnprocessedByCustomer(TENANT_ID, 'customer-id')).toEqual([]);
    });
  });

  describe('findUnprocessedExpiringUntil()', () => {
    it('returns an empty array when nothing expires before the bound', async () => {
      mockQueryBuilder([]);

      expect(await repo.findUnprocessedExpiringUntil(new Date())).toEqual([]);
    });

    it('maps unprocessed entries to LoyaltyEntry domain objects, excluding the processed ones', async () => {
      const qb = mockQueryBuilder([
        new LoyaltyEntryEntityBuilder()
          .withExpiresAt(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))
          .build(),
      ]);
      const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const result = await repo.findUnprocessedExpiringUntil(to);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(LoyaltyEntry);
      expect(qb.where).toHaveBeenCalledWith('e.expiresAt <= :to', { to });
      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('balance_expiry_log'));
    });
  });
});
