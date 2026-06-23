import { InMemoryLoyaltyBalanceRepository } from '../../../../../test/infrastructure/in-memory-loyalty-balance.repository';
import { InMemoryLoyaltyRedemptionRepository } from '../../../../../test/infrastructure/in-memory-loyalty-redemption.repository';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { LoyaltyBalanceBuilder } from '../../../../../test/builders/loyalty/loyalty-balance.builder';
import {
  LoyaltyBalanceNotFoundError,
  LoyaltyInsufficientPointsError,
} from '../../../domain/errors/loyalty-domain.error';
import { RedeemPointsUseCase } from './redeem-points.use-case';

const TENANT_ID = '10000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = 'aaaaaaaa-0000-7000-8000-000000000001';
const STAFF_ID = 'bbbbbbbb-0000-7000-8000-000000000001';

describe('RedeemPointsUseCase', () => {
  let balanceRepo: InMemoryLoyaltyBalanceRepository;
  let redemptionRepo: InMemoryLoyaltyRedemptionRepository;
  let txManager: InMemoryTransactionManager;
  let useCase: RedeemPointsUseCase;

  beforeEach(() => {
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    redemptionRepo = new InMemoryLoyaltyRedemptionRepository();
    txManager = new InMemoryTransactionManager();
    useCase = new RedeemPointsUseCase(balanceRepo, redemptionRepo, txManager);
  });

  it('decrements balance and returns correct result', async () => {
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(50)
        .build(),
    );

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      pointsToRedeem: 20,
      pointsPerCurrencyUnit: 0,
      redeemedBy: STAFF_ID,
      notes: 'Free wash',
    });

    expect(result.newBalance).toBe(30);
    expect(result.pointsRedeemed).toBe(20);
    expect(result.customerId).toBe(CUSTOMER_ID);
    expect(result.redemptionId).toBeDefined();
    expect(result.redeemedAt).toBeDefined();
  });

  it('persists redemption record to repository', async () => {
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(30)
        .build(),
    );

    await useCase.execute({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      pointsToRedeem: 10,
      pointsPerCurrencyUnit: 0,
      redeemedBy: STAFF_ID,
    });

    const { items } = await redemptionRepo.findByCustomer(TENANT_ID, CUSTOMER_ID, 1, 20);
    expect(items).toHaveLength(1);
    expect(items[0].pointsRedeemed).toBe(10);
    expect(items[0].redeemedBy).toBe(STAFF_ID);
  });

  it('persists the pointsPerCurrencyUnit rate in effect at redemption time', async () => {
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(30)
        .build(),
    );

    await useCase.execute({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      pointsToRedeem: 10,
      pointsPerCurrencyUnit: 10,
      redeemedBy: STAFF_ID,
    });

    const { items } = await redemptionRepo.findByCustomer(TENANT_ID, CUSTOMER_ID, 1, 20);
    expect(items[0].pointsPerCurrencyUnit).toBe(10);
  });

  it('stores optional notes and bookingId on the redemption', async () => {
    const BOOKING_ID = 'dddddddd-0000-7000-8000-000000000001';
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(100)
        .build(),
    );

    await useCase.execute({
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      pointsToRedeem: 50,
      pointsPerCurrencyUnit: 0,
      redeemedBy: STAFF_ID,
      notes: 'Discount applied',
      bookingId: BOOKING_ID,
    });

    const { items } = await redemptionRepo.findByCustomer(TENANT_ID, CUSTOMER_ID, 1, 20);
    expect(items[0].notes).toBe('Discount applied');
    expect(items[0].bookingId).toBe(BOOKING_ID);
  });

  it('throws LoyaltyBalanceNotFoundError when customer has no balance row', async () => {
    await expect(
      useCase.execute({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        pointsToRedeem: 10,
        pointsPerCurrencyUnit: 0,
        redeemedBy: STAFF_ID,
      }),
    ).rejects.toThrow(LoyaltyBalanceNotFoundError);
  });

  it('throws LoyaltyInsufficientPointsError when redeeming more than balance', async () => {
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(5)
        .build(),
    );

    await expect(
      useCase.execute({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        pointsToRedeem: 10,
        pointsPerCurrencyUnit: 0,
        redeemedBy: STAFF_ID,
      }),
    ).rejects.toThrow(LoyaltyInsufficientPointsError);
  });

  it('does not persist anything when LoyaltyInsufficientPointsError is thrown', async () => {
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(5)
        .build(),
    );

    await expect(
      useCase.execute({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        pointsToRedeem: 10,
        pointsPerCurrencyUnit: 0,
        redeemedBy: STAFF_ID,
      }),
    ).rejects.toThrow();

    const { items } = await redemptionRepo.findByCustomer(TENANT_ID, CUSTOMER_ID, 1, 20);
    expect(items).toHaveLength(0);
  });
});
