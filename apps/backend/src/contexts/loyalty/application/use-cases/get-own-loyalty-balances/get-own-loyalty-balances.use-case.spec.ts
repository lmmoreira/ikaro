import { InMemoryLoyaltyBalanceRepository } from '../../../../../test/repositories/loyalty/in-memory-loyalty-balance.repository';
import { InMemoryLoyaltyCustomerPort } from '../../../../../test/infrastructure/in-memory-loyalty-customer.port';
import { LoyaltyBalanceBuilder } from '../../../../../test/builders/loyalty/index';
import { LoyaltyCustomerNotFoundInTenantError } from '../../../domain/errors/loyalty-domain.error';
import { GetOwnLoyaltyBalancesUseCase } from './get-own-loyalty-balances.use-case';

const TENANT_A = '10000000-0000-7000-8000-000000000001';
const TENANT_B = '10000000-0000-7000-8000-000000000002';
const TENANT_C = '10000000-0000-7000-8000-000000000003';
const CUSTOMER_ID = 'aaaaaaaa-0000-7000-8000-000000000001';
const TENANT_B_CUSTOMER_ID = 'bbbbbbbb-0000-7000-8000-000000000002';
const TENANT_C_CUSTOMER_ID = 'cccccccc-0000-7000-8000-000000000003';

describe('GetOwnLoyaltyBalancesUseCase', () => {
  let balanceRepo: InMemoryLoyaltyBalanceRepository;
  let loyaltyCustomer: InMemoryLoyaltyCustomerPort;
  let useCase: GetOwnLoyaltyBalancesUseCase;

  beforeEach(() => {
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    loyaltyCustomer = new InMemoryLoyaltyCustomerPort();
    useCase = new GetOwnLoyaltyBalancesUseCase(balanceRepo, loyaltyCustomer);
  });

  it('returns the balance for every tenant the actor is linked to, including the home tenant', async () => {
    loyaltyCustomer.seed(CUSTOMER_ID, TENANT_A, TENANT_B, TENANT_B_CUSTOMER_ID);
    loyaltyCustomer.seed(CUSTOMER_ID, TENANT_A, TENANT_C, TENANT_C_CUSTOMER_ID);
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(100)
        .build(),
    );
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_B)
        .withCustomerId(TENANT_B_CUSTOMER_ID)
        .withCurrentPoints(50)
        .build(),
    );

    const result = await useCase.execute({ contextTenantId: TENANT_A, actorId: CUSTOMER_ID });

    expect(result).toEqual(
      expect.arrayContaining([
        { tenantId: TENANT_A, currentPoints: 100 },
        { tenantId: TENANT_B, currentPoints: 50 },
        { tenantId: TENANT_C, currentPoints: 0 },
      ]),
    );
    expect(result).toHaveLength(3);
  });

  it('defaults missing balances to 0 instead of omitting the tenant', async () => {
    loyaltyCustomer.seedHome(CUSTOMER_ID, TENANT_A);
    // No balance row seeded anywhere — the actor still gets one entry per linked tenant.
    const result = await useCase.execute({ contextTenantId: TENANT_A, actorId: CUSTOMER_ID });

    expect(result).toEqual([{ tenantId: TENANT_A, currentPoints: 0 }]);
  });

  it('never accepts a caller-supplied customerId — pairs are derived entirely from the actor identity', async () => {
    loyaltyCustomer.seedHome(CUSTOMER_ID, TENANT_A);
    // A different customer's balance in TENANT_B must not leak into this actor's result,
    // even though both rows share the same tenant, because the actor has no link there.
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_B)
        .withCustomerId('dddddddd-0000-7000-8000-000000000004')
        .withCurrentPoints(999)
        .build(),
    );

    const result = await useCase.execute({ contextTenantId: TENANT_A, actorId: CUSTOMER_ID });

    expect(result).toEqual([{ tenantId: TENANT_A, currentPoints: 0 }]);
  });

  it('tenant isolation: throws not-found when the actor has no home record in the given contextTenantId', async () => {
    // CUSTOMER_ID's real home is TENANT_A (never seeded here) — calling with TENANT_B as the
    // contextTenantId must not silently succeed just because the actor identity is reused.
    loyaltyCustomer.seedHome(CUSTOMER_ID, TENANT_A);

    await expect(
      useCase.execute({ contextTenantId: TENANT_B, actorId: CUSTOMER_ID }),
    ).rejects.toThrow(LoyaltyCustomerNotFoundInTenantError);
  });
});
