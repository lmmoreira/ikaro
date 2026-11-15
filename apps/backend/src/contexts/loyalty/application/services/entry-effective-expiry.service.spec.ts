import { LoyaltyEntryBuilder } from '../../../../test/builders/loyalty/index';
import { InMemoryTenantExpiryPauseRepository } from '../../../../test/repositories/loyalty/in-memory-tenant-expiry-pause.repository';
import { EntryEffectiveExpiryService } from './entry-effective-expiry.service';

const TENANT_A = '00000000-0000-7000-8000-00000000000a';
const TENANT_B = '00000000-0000-7000-8000-00000000000b';
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-01T00:00:00.000Z');
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * DAY);

describe('EntryEffectiveExpiryService', () => {
  let pauseRepo: InMemoryTenantExpiryPauseRepository;
  let service: EntryEffectiveExpiryService;

  beforeEach(() => {
    pauseRepo = new InMemoryTenantExpiryPauseRepository();
    service = new EntryEffectiveExpiryService(pauseRepo);
  });

  it('answers an empty map for no entries, without reading the ledger', async () => {
    const spy = jest.spyOn(pauseRepo, 'findByTenantIds');

    expect((await service.resolve([])).size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("applies only the entry's own tenant pauses and reads the ledger once for all entries", async () => {
    const spy = jest.spyOn(pauseRepo, 'findByTenantIds');
    await pauseRepo.recordClosed(TENANT_A, daysAgo(20), daysAgo(15));
    await pauseRepo.recordOpen(TENANT_B, daysAgo(20));
    const held = new LoyaltyEntryBuilder()
      .withTenantId(TENANT_B)
      .withEarnedAt(daysAgo(40))
      .withExpiresAt(daysAgo(10))
      .build();
    const shifted = new LoyaltyEntryBuilder()
      .withTenantId(TENANT_A)
      .withEarnedAt(daysAgo(40))
      .withExpiresAt(daysAgo(10))
      .build();
    const untouched = new LoyaltyEntryBuilder()
      .withTenantId(TENANT_A)
      .withEarnedAt(daysAgo(5))
      .withExpiresAt(daysAgo(1))
      .build();

    const result = await service.resolve([held, shifted, untouched]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.get(held.id)).toBeNull();
    expect(result.get(shifted.id)).toEqual(daysAgo(5));
    expect(result.get(untouched.id)).toEqual(daysAgo(1));
  });
});
