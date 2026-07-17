import { InMemoryLoyaltyBalanceRepository } from '../../../../../test/infrastructure/in-memory-loyalty-balance.repository';
import { InMemoryLoyaltyEntryRepository } from '../../../../../test/infrastructure/in-memory-loyalty-entry.repository';
import { InMemoryLoyaltyCustomerPort } from '../../../../../test/infrastructure/in-memory-loyalty-customer.port';
import { LoyaltyBalanceBuilder } from '../../../../../test/builders/loyalty/index';
import { LoyaltyCustomerNotFoundInTenantError } from '../../../domain/errors/loyalty-domain.error';
import { GetLoyaltyBalanceUseCase } from '../get-loyalty-balance/get-loyalty-balance.use-case';
import { GetOwnLoyaltyBalanceUseCase } from './get-own-loyalty-balance.use-case';

const TENANT_ID = '10000000-0000-7000-8000-000000000001';
const OTHER_TENANT = '10000000-0000-7000-8000-000000000002';
const CUSTOMER_ID = 'aaaaaaaa-0000-7000-8000-000000000001';
const OTHER_TENANT_CUSTOMER_ID = 'bbbbbbbb-0000-7000-8000-000000000099';

describe('GetOwnLoyaltyBalanceUseCase', () => {
  let balanceRepo: InMemoryLoyaltyBalanceRepository;
  let entryRepo: InMemoryLoyaltyEntryRepository;
  let loyaltyCustomer: InMemoryLoyaltyCustomerPort;
  let useCase: GetOwnLoyaltyBalanceUseCase;

  beforeEach(() => {
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    entryRepo = new InMemoryLoyaltyEntryRepository();
    loyaltyCustomer = new InMemoryLoyaltyCustomerPort();
    useCase = new GetOwnLoyaltyBalanceUseCase(
      new GetLoyaltyBalanceUseCase(balanceRepo, entryRepo),
      loyaltyCustomer,
    );
  });

  it("returns the actor's own balance and isCrossTenant=false for a same-tenant call", async () => {
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(100)
        .build(),
    );

    const result = await useCase.execute({
      contextTenantId: TENANT_ID,
      targetTenantId: TENANT_ID,
      actorId: CUSTOMER_ID,
    });

    expect(result.isCrossTenant).toBe(false);
    expect(result.balance.currentPoints).toBe(100);
  });

  it('resolves the customer in the target tenant and returns isCrossTenant=true', async () => {
    loyaltyCustomer.seed(CUSTOMER_ID, TENANT_ID, OTHER_TENANT, OTHER_TENANT_CUSTOMER_ID);
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(OTHER_TENANT)
        .withCustomerId(OTHER_TENANT_CUSTOMER_ID)
        .withCurrentPoints(77)
        .build(),
    );

    const result = await useCase.execute({
      contextTenantId: TENANT_ID,
      targetTenantId: OTHER_TENANT,
      actorId: CUSTOMER_ID,
    });

    expect(result.isCrossTenant).toBe(true);
    expect(result.balance.currentPoints).toBe(77);
  });

  it('propagates the not-found error when the actor has no record in the target tenant', async () => {
    await expect(
      useCase.execute({
        contextTenantId: TENANT_ID,
        targetTenantId: OTHER_TENANT,
        actorId: CUSTOMER_ID,
      }),
    ).rejects.toThrow(LoyaltyCustomerNotFoundInTenantError);
  });
});
