import { InMemoryLoyaltyBalanceRepository } from '../../../../../test/repositories/loyalty/in-memory-loyalty-balance.repository';
import { LoyaltyBalanceBuilder } from '../../../../../test/builders/loyalty/index';
import { GetLoyaltyBalancesUseCase } from './get-loyalty-balances.use-case';

const TENANT_A = '00000000-0000-7000-8000-000000000001';
const TENANT_B = '00000000-0000-7000-8000-000000000002';
const CUSTOMER_1 = 'aaaaaaaa-0000-7000-8000-000000000001';
const CUSTOMER_2 = 'aaaaaaaa-0000-7000-8000-000000000002';
const CUSTOMER_3 = 'aaaaaaaa-0000-7000-8000-000000000003';

describe('GetLoyaltyBalancesUseCase', () => {
  let balanceRepo: InMemoryLoyaltyBalanceRepository;
  let useCase: GetLoyaltyBalancesUseCase;

  beforeEach(() => {
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    useCase = new GetLoyaltyBalancesUseCase(balanceRepo);
  });

  it('returns currentPoints for each requested customer', async () => {
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_1)
        .withCurrentPoints(50)
        .build(),
    );
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_2)
        .withCurrentPoints(75)
        .build(),
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      customerIds: [CUSTOMER_1, CUSTOMER_2],
    });

    expect(result.items).toEqual([
      { customerId: CUSTOMER_1, currentPoints: 50 },
      { customerId: CUSTOMER_2, currentPoints: 75 },
    ]);
  });

  it('preserves the requested customerIds order, defaulting a customer with no balance row to 0', async () => {
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_2)
        .withCurrentPoints(30)
        .build(),
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      customerIds: [CUSTOMER_1, CUSTOMER_2, CUSTOMER_3],
    });

    expect(result.items).toEqual([
      { customerId: CUSTOMER_1, currentPoints: 0 },
      { customerId: CUSTOMER_2, currentPoints: 30 },
      { customerId: CUSTOMER_3, currentPoints: 0 },
    ]);
  });

  it('returns an empty items array when customerIds is empty', async () => {
    const result = await useCase.execute({ tenantId: TENANT_A, customerIds: [] });
    expect(result.items).toEqual([]);
  });

  it('tenant isolation: a customer balance from another tenant is not returned', async () => {
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_B)
        .withCustomerId(CUSTOMER_1)
        .withCurrentPoints(999)
        .build(),
    );

    const result = await useCase.execute({ tenantId: TENANT_A, customerIds: [CUSTOMER_1] });

    expect(result.items).toEqual([{ customerId: CUSTOMER_1, currentPoints: 0 }]);
  });
});
