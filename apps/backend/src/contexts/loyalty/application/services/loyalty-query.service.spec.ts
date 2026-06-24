import { InMemoryLoyaltyBalanceRepository } from '../../../../test/infrastructure/in-memory-loyalty-balance.repository';
import { LoyaltyBalance } from '../../domain/loyalty-balance.aggregate';
import { LoyaltyQueryService } from './loyalty-query.service';

const TENANT_ID = '10000000-0000-4000-8000-000000000150';
const CUSTOMER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('LoyaltyQueryService', () => {
  let repo: InMemoryLoyaltyBalanceRepository;
  let service: LoyaltyQueryService;

  beforeEach(() => {
    repo = new InMemoryLoyaltyBalanceRepository();
    service = new LoyaltyQueryService(repo);
  });

  it('returns currentPoints when a balance row exists', async () => {
    const balance = LoyaltyBalance.create(TENANT_ID, CUSTOMER_ID);
    balance.increment(75);
    await repo.upsert(balance);

    const points = await service.getCurrentPoints(TENANT_ID, CUSTOMER_ID);

    expect(points).toBe(75);
  });

  it('returns 0 when no balance row exists', async () => {
    const points = await service.getCurrentPoints(TENANT_ID, CUSTOMER_ID);

    expect(points).toBe(0);
  });
});
