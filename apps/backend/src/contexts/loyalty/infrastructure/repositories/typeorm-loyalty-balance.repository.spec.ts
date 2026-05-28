import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LoyaltyBalanceBuilder,
  LoyaltyBalanceEntityBuilder,
} from '../../../../test/builders/loyalty/index';
import { LoyaltyBalance } from '../../domain/loyalty-balance.aggregate';
import { LoyaltyBalanceEntity } from '../entities/loyalty-balance.entity';
import { TypeOrmLoyaltyBalanceRepository } from './typeorm-loyalty-balance.repository';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000002';

describe('TypeOrmLoyaltyBalanceRepository', () => {
  let repo: TypeOrmLoyaltyBalanceRepository;
  let ormRepo: jest.Mocked<Repository<LoyaltyBalanceEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmLoyaltyBalanceRepository,
        {
          provide: getRepositoryToken(LoyaltyBalanceEntity),
          useValue: {
            findOne: jest.fn(),
            upsert: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmLoyaltyBalanceRepository);
    ormRepo = moduleRef.get(getRepositoryToken(LoyaltyBalanceEntity));
  });

  describe('findByCustomer()', () => {
    it('returns null when no balance row exists', async () => {
      ormRepo.findOne.mockResolvedValue(null);
      const result = await repo.findByCustomer(TENANT_ID, CUSTOMER_ID);
      expect(result).toBeNull();
    });

    it('maps entity to LoyaltyBalance domain object', async () => {
      ormRepo.findOne.mockResolvedValue(
        new LoyaltyBalanceEntityBuilder()
          .withTenantId(TENANT_ID)
          .withCustomerId(CUSTOMER_ID)
          .withCurrentPoints(50)
          .build(),
      );

      const result = await repo.findByCustomer(TENANT_ID, CUSTOMER_ID);

      expect(result).toBeInstanceOf(LoyaltyBalance);
      expect(result!.currentPoints).toBe(50);
    });
  });

  describe('upsert()', () => {
    it('delegates to ormRepo.upsert with mapped entity', async () => {
      ormRepo.upsert.mockResolvedValue({ raw: [], generatedMaps: [], identifiers: [] });
      const balance = new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(30)
        .build();

      await repo.upsert(balance);

      expect(ormRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          customerId: CUSTOMER_ID,
          currentPoints: 30,
        }),
        ['tenantId', 'customerId'],
      );
    });
  });
});
