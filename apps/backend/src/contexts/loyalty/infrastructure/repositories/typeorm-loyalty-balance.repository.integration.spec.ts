import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import { LoyaltyBalance } from '../../domain/loyalty-balance.aggregate';
import { LoyaltyBalanceEntity } from '../entities/loyalty-balance.entity';
import { TypeOrmLoyaltyBalanceRepository } from './typeorm-loyalty-balance.repository';

const TENANT_A = '10000000-0000-7000-8000-000000000001';
const TENANT_B = '20000000-0000-7000-8000-000000000002';
const CUSTOMER_1 = '00000000-0000-7000-8000-100000000001';
const CUSTOMER_2 = '00000000-0000-7000-8000-100000000002';

describe('TypeOrmLoyaltyBalanceRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmLoyaltyBalanceRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmLoyaltyBalanceRepository(dataSource.getRepository(LoyaltyBalanceEntity));
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  afterEach(async () => {
    await dataSource.query(`DELETE FROM "loyalty"."loyalty_balances"`);
  });

  describe('upsert() + findByCustomer()', () => {
    it('creates a new balance row on first upsert', async () => {
      const balance = LoyaltyBalance.create(TENANT_A, CUSTOMER_1);
      balance.increment(20);

      await repo.upsert(balance);

      const found = await repo.findByCustomer(TENANT_A, CUSTOMER_1);
      expect(found).not.toBeNull();
      expect(found!.currentPoints).toBe(20);
    });

    it('updates existing balance row on subsequent upsert', async () => {
      const balance = LoyaltyBalance.create(TENANT_A, CUSTOMER_1);
      balance.increment(10);
      await repo.upsert(balance);

      balance.increment(15);
      await repo.upsert(balance);

      const found = await repo.findByCustomer(TENANT_A, CUSTOMER_1);
      expect(found!.currentPoints).toBe(25);
    });

    it('returns null for unknown customer', async () => {
      const result = await repo.findByCustomer(TENANT_A, CUSTOMER_1);
      expect(result).toBeNull();
    });

    it('increment then decrement yields correct balance', async () => {
      const balance = LoyaltyBalance.create(TENANT_A, CUSTOMER_1);
      balance.increment(30);
      await repo.upsert(balance);

      const loaded = await repo.findByCustomer(TENANT_A, CUSTOMER_1);
      loaded!.decrement(10);
      await repo.upsert(loaded!);

      const final = await repo.findByCustomer(TENANT_A, CUSTOMER_1);
      expect(final!.currentPoints).toBe(20);
    });

    it('decrement below zero throws domain error before touching DB', async () => {
      const balance = LoyaltyBalance.create(TENANT_A, CUSTOMER_1);
      balance.increment(5);
      await repo.upsert(balance);

      const loaded = await repo.findByCustomer(TENANT_A, CUSTOMER_1);
      expect(() => loaded!.decrement(10)).toThrow();

      const unchanged = await repo.findByCustomer(TENANT_A, CUSTOMER_1);
      expect(unchanged!.currentPoints).toBe(5);
    });
  });

  describe('findManyByCustomers()', () => {
    it('returns balances only for the requested customerIds within one tenant', async () => {
      const b1 = LoyaltyBalance.create(TENANT_A, CUSTOMER_1);
      b1.increment(10);
      const b2 = LoyaltyBalance.create(TENANT_A, CUSTOMER_2);
      b2.increment(40);
      await repo.upsert(b1);
      await repo.upsert(b2);

      const result = await repo.findManyByCustomers(TENANT_A, [CUSTOMER_1, CUSTOMER_2]);

      expect(result).toHaveLength(2);
      expect(result.map((b) => b.currentPoints).sort()).toEqual([10, 40]);
    });

    it('returns an empty array when customerIds is empty', async () => {
      const result = await repo.findManyByCustomers(TENANT_A, []);
      expect(result).toEqual([]);
    });

    it('tenant isolation: does not return a balance belonging to another tenant', async () => {
      const balance = LoyaltyBalance.create(TENANT_B, CUSTOMER_1);
      balance.increment(999);
      await repo.upsert(balance);

      const result = await repo.findManyByCustomers(TENANT_A, [CUSTOMER_1]);

      expect(result).toEqual([]);
    });
  });

  describe('findManyByTenantCustomerPairs()', () => {
    it('returns balances only for the requested tenant/customer pairs', async () => {
      const b1 = LoyaltyBalance.create(TENANT_A, CUSTOMER_1);
      b1.increment(10);
      const b2 = LoyaltyBalance.create(TENANT_B, CUSTOMER_2);
      b2.increment(40);
      await repo.upsert(b1);
      await repo.upsert(b2);

      const result = await repo.findManyByTenantCustomerPairs([
        { tenantId: TENANT_A, customerId: CUSTOMER_1 },
        { tenantId: TENANT_B, customerId: CUSTOMER_2 },
      ]);

      expect(result).toHaveLength(2);
      expect(result.map((b) => b.currentPoints).sort()).toEqual([10, 40]);
    });

    it('returns an empty array when pairs is empty', async () => {
      const result = await repo.findManyByTenantCustomerPairs([]);
      expect(result).toEqual([]);
    });

    it("does not cross-match a customerId from one pair with a different pair's tenantId", async () => {
      // CUSTOMER_1 only has a balance in TENANT_A; CUSTOMER_2 only has one in TENANT_B.
      // Requesting (TENANT_A, CUSTOMER_2) and (TENANT_B, CUSTOMER_1) — the "swapped" pairs —
      // must return nothing, proving the query is a genuine per-pair AND, not an OR across
      // tenantIds and customerIds independently.
      const b1 = LoyaltyBalance.create(TENANT_A, CUSTOMER_1);
      b1.increment(10);
      const b2 = LoyaltyBalance.create(TENANT_B, CUSTOMER_2);
      b2.increment(40);
      await repo.upsert(b1);
      await repo.upsert(b2);

      const result = await repo.findManyByTenantCustomerPairs([
        { tenantId: TENANT_A, customerId: CUSTOMER_2 },
        { tenantId: TENANT_B, customerId: CUSTOMER_1 },
      ]);

      expect(result).toEqual([]);
    });
  });

  describe('tenant isolation', () => {
    it('findByCustomer with Tenant B id returns null for Tenant A customer', async () => {
      const balance = LoyaltyBalance.create(TENANT_A, CUSTOMER_1);
      balance.increment(50);
      await repo.upsert(balance);

      const result = await repo.findByCustomer(TENANT_B, CUSTOMER_1);
      expect(result).toBeNull();
    });

    it('two customers in same tenant have independent balances', async () => {
      const b1 = LoyaltyBalance.create(TENANT_A, CUSTOMER_1);
      b1.increment(10);
      const b2 = LoyaltyBalance.create(TENANT_A, CUSTOMER_2);
      b2.increment(40);

      await repo.upsert(b1);
      await repo.upsert(b2);

      const found1 = await repo.findByCustomer(TENANT_A, CUSTOMER_1);
      const found2 = await repo.findByCustomer(TENANT_A, CUSTOMER_2);

      expect(found1!.currentPoints).toBe(10);
      expect(found2!.currentPoints).toBe(40);
    });
  });
});
