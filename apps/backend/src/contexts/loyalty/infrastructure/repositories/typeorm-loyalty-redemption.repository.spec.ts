import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LoyaltyRedemptionBuilder,
  LoyaltyRedemptionEntityBuilder,
} from '../../../../test/builders/loyalty/index';
import { LoyaltyRedemption } from '../../domain/loyalty-redemption.aggregate';
import { LoyaltyRedemptionEntity } from '../entities/loyalty-redemption.entity';
import { TypeOrmLoyaltyRedemptionRepository } from './typeorm-loyalty-redemption.repository';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000002';

describe('TypeOrmLoyaltyRedemptionRepository', () => {
  let repo: TypeOrmLoyaltyRedemptionRepository;
  let ormRepo: jest.Mocked<Repository<LoyaltyRedemptionEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmLoyaltyRedemptionRepository,
        {
          provide: getRepositoryToken(LoyaltyRedemptionEntity),
          useValue: {
            save: jest.fn(),
            findAndCount: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmLoyaltyRedemptionRepository);
    ormRepo = moduleRef.get(getRepositoryToken(LoyaltyRedemptionEntity));
  });

  describe('save()', () => {
    it('delegates to ormRepo.save with mapped entity', async () => {
      ormRepo.save.mockResolvedValue(
        new LoyaltyRedemptionEntityBuilder().withTenantId(TENANT_ID).build(),
      );
      const redemption = new LoyaltyRedemptionBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .build();

      await repo.save(redemption);

      expect(ormRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID, customerId: CUSTOMER_ID }),
      );
    });
  });

  describe('findByCustomer()', () => {
    it('returns empty result when no redemptions exist', async () => {
      ormRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await repo.findByCustomer(TENANT_ID, CUSTOMER_ID, 1, 20);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('maps entities to LoyaltyRedemption domain objects', async () => {
      const entity = new LoyaltyRedemptionEntityBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withPointsRedeemed(50)
        .build();
      ormRepo.findAndCount.mockResolvedValue([[entity], 1]);

      const result = await repo.findByCustomer(TENANT_ID, CUSTOMER_ID, 1, 20);

      expect(result.total).toBe(1);
      expect(result.items[0]).toBeInstanceOf(LoyaltyRedemption);
      expect(result.items[0].pointsRedeemed).toBe(50);
    });
  });
});
