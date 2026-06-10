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

  describe('findNextExpiry()', () => {
    it('returns null when no active entries', async () => {
      (ormRepo.query as jest.Mock).mockResolvedValue([]);

      const result = await repo.findNextExpiry(TENANT_ID, 'customer-id');

      expect(result).toBeNull();
    });

    it('returns earliest expiry date and sum of points', async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      (ormRepo.query as jest.Mock).mockResolvedValue([
        { expiryDate: futureDate.toISOString(), points: '10' },
      ]);

      const result = await repo.findNextExpiry(TENANT_ID, 'customer-id');

      expect(result).not.toBeNull();
      expect(result!.points).toBe(10);
    });
  });

  describe('findExpiringBefore()', () => {
    it('returns empty array when no expiring entries', async () => {
      ormRepo.find.mockResolvedValue([]);

      const result = await repo.findExpiringBefore(new Date());

      expect(result).toEqual([]);
    });

    it('maps expiring entries to LoyaltyEntry domain objects', async () => {
      const pastDate = new Date(Date.now() - 1000);
      ormRepo.find.mockResolvedValue([
        new LoyaltyEntryEntityBuilder().withExpiresAt(pastDate).build(),
      ]);

      const result = await repo.findExpiringBefore(new Date());

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(LoyaltyEntry);
    });
  });

  describe('findExpiringSoon()', () => {
    it('returns empty array when no entries in window', async () => {
      ormRepo.find.mockResolvedValue([]);

      const from = new Date();
      const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const result = await repo.findExpiringSoon(from, to);

      expect(result).toEqual([]);
    });

    it('maps entries within the window to LoyaltyEntry domain objects', async () => {
      const soonDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      ormRepo.find.mockResolvedValue([
        new LoyaltyEntryEntityBuilder().withExpiresAt(soonDate).build(),
      ]);

      const from = new Date();
      const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const result = await repo.findExpiringSoon(from, to);

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(LoyaltyEntry);
    });
  });
});
