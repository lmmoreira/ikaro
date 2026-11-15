import {
  LoyaltyBalanceBuilder,
  LoyaltyEntryBuilder,
} from '../../../../test/builders/loyalty/index';
import { InMemoryLoyaltyBalanceRepository } from '../../../../test/repositories/loyalty/in-memory-loyalty-balance.repository';
import { InMemoryLoyaltyEntryRepository } from '../../../../test/repositories/loyalty/in-memory-loyalty-entry.repository';
import { InMemoryTenantExpiryPauseRepository } from '../../../../test/repositories/loyalty/in-memory-tenant-expiry-pause.repository';
import { EntryEffectiveExpiryService } from './entry-effective-expiry.service';
import { LoyaltyBalanceReaderService } from './loyalty-balance-reader.service';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-7000-8000-000000000002';
const CUSTOMER_ID = 'aaaaaaaa-0000-7000-8000-000000000001';
const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number): Date => new Date(Date.now() + n * DAY);

describe('LoyaltyBalanceReaderService', () => {
  let entryRepo: InMemoryLoyaltyEntryRepository;
  let pauseRepo: InMemoryTenantExpiryPauseRepository;
  let service: LoyaltyBalanceReaderService;

  beforeEach(async () => {
    entryRepo = new InMemoryLoyaltyEntryRepository();
    pauseRepo = new InMemoryTenantExpiryPauseRepository();
    const balanceRepo = new InMemoryLoyaltyBalanceRepository();
    await balanceRepo.upsert(
      new LoyaltyBalanceBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .withCurrentPoints(60)
        .build(),
    );
    service = new LoyaltyBalanceReaderService(
      balanceRepo,
      entryRepo,
      new EntryEffectiveExpiryService(pauseRepo),
    );
  });

  function entry(points: number, expiresInDays: number, tenantId = TENANT_ID) {
    return new LoyaltyEntryBuilder()
      .withTenantId(tenantId)
      .withCustomerId(CUSTOMER_ID)
      .withPoints(points)
      .withEarnedAt(inDays(expiresInDays - 60))
      .withExpiresAt(inDays(expiresInDays))
      .build();
  }

  it('returns no next expiry when the customer has no entries', async () => {
    const result = await service.read(TENANT_ID, CUSTOMER_ID);

    expect(result).toEqual({ currentPoints: 60, nextExpiryDate: null, nextExpiryPoints: null });
  });

  it('returns the earliest expiry with the points expiring on it', async () => {
    const sooner = entry(10, 30);
    await entryRepo.save(sooner);
    await entryRepo.save(entry(20, 90));

    const result = await service.read(TENANT_ID, CUSTOMER_ID);

    expect(result.nextExpiryDate).toBe(sooner.expiresAt.toISOString());
    expect(result.nextExpiryPoints).toBe(10);
  });

  it('ignores entries already expired and entries the sweep already processed', async () => {
    const expired = entry(5, -3);
    const processed = entry(7, 10);
    await entryRepo.save(expired);
    await entryRepo.save(processed);
    entryRepo.processedIds.add(processed.id);
    await entryRepo.save(entry(20, 90));

    const result = await service.read(TENANT_ID, CUSTOMER_ID);

    expect(result.nextExpiryPoints).toBe(20);
  });

  it('reports the effective expiry once a closed pause has shifted it', async () => {
    const shifted = entry(10, 30);
    await entryRepo.save(shifted);
    // A 5-day pause inside the entry lifetime moves its expiry 5 days later.
    await pauseRepo.recordClosed(TENANT_ID, inDays(-10), inDays(-5));

    const result = await service.read(TENANT_ID, CUSTOMER_ID);

    expect(new Date(result.nextExpiryDate as string).getTime()).toBe(
      shifted.expiresAt.getTime() + 5 * DAY,
    );
  });

  it('keeps an entry past its stored expiry alive while its pause shifts it into the future', async () => {
    await entryRepo.save(entry(10, -2));
    await pauseRepo.recordClosed(TENANT_ID, inDays(-12), inDays(-1));

    const result = await service.read(TENANT_ID, CUSTOMER_ID);

    expect(result.nextExpiryPoints).toBe(10);
  });

  it('applies only the pauses of the entry tenant', async () => {
    const own = entry(10, 30);
    await entryRepo.save(own);
    await pauseRepo.recordClosed(OTHER_TENANT_ID, inDays(-10), inDays(-5));

    const result = await service.read(TENANT_ID, CUSTOMER_ID);

    expect(result.nextExpiryDate).toBe(own.expiresAt.toISOString());
  });
});
