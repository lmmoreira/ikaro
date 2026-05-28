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
            find: jest.fn(),
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
});
