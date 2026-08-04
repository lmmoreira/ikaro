import { InMemoryLoyaltyBalanceRepository } from '../../../../../test/repositories/loyalty/in-memory-loyalty-balance.repository';
import { InMemoryLoyaltyEntryRepository } from '../../../../../test/repositories/loyalty/in-memory-loyalty-entry.repository';
import {
  LoyaltyBalanceBuilder,
  LoyaltyEntryBuilder,
} from '../../../../../test/builders/loyalty/index';
import { GetLoyaltyBalanceUseCase } from './get-loyalty-balance.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = 'aaaaaaaa-0000-7000-8000-000000000001';

describe('GetLoyaltyBalanceUseCase', () => {
  let balanceRepo: InMemoryLoyaltyBalanceRepository;
  let entryRepo: InMemoryLoyaltyEntryRepository;
  let useCase: GetLoyaltyBalanceUseCase;

  beforeEach(() => {
    balanceRepo = new InMemoryLoyaltyBalanceRepository();
    entryRepo = new InMemoryLoyaltyEntryRepository();
    useCase = new GetLoyaltyBalanceUseCase(balanceRepo, entryRepo);
  });

  it('returns zero balance and no expiry when customer has no data', async () => {
    const result = await useCase.execute({ tenantId: TENANT_ID, customerId: CUSTOMER_ID });

    expect(result.currentPoints).toBe(0);
    expect(result.nextExpiryDate).toBeNull();
    expect(result.nextExpiryPoints).toBeNull();
  });

  it('returns currentPoints from balance row', async () => {
    const balance = new LoyaltyBalanceBuilder()
      .withTenantId(TENANT_ID)
      .withCustomerId(CUSTOMER_ID)
      .withCurrentPoints(75)
      .build();
    await balanceRepo.upsert(balance);

    const result = await useCase.execute({ tenantId: TENANT_ID, customerId: CUSTOMER_ID });

    expect(result.currentPoints).toBe(75);
  });

  it('returns nextExpiryDate and nextExpiryPoints from earliest active entry', async () => {
    const sooner = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const later = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withPoints(10)
        .withExpiresAt(sooner)
        .build(),
    );
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withPoints(20)
        .withExpiresAt(later)
        .build(),
    );

    const result = await useCase.execute({ tenantId: TENANT_ID, customerId: CUSTOMER_ID });

    expect(result.nextExpiryDate).toBe(sooner.toISOString());
    expect(result.nextExpiryPoints).toBe(10);
  });

  it('excludes expired entries from nextExpiry', async () => {
    const past = new Date(Date.now() - 1000);
    await entryRepo.save(
      new LoyaltyEntryBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withPoints(5)
        .withExpiresAt(past)
        .build(),
    );

    const result = await useCase.execute({ tenantId: TENANT_ID, customerId: CUSTOMER_ID });

    expect(result.nextExpiryDate).toBeNull();
    expect(result.nextExpiryPoints).toBeNull();
  });
});
