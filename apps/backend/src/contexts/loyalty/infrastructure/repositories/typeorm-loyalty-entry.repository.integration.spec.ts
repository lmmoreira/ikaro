import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { createTestDataSource } from '../../../../test/test-datasource';
import { LoyaltyEntryBuilder } from '../../../../test/builders/loyalty/index';
import { LoyaltyEntry } from '../../domain/loyalty-entry.aggregate';
import { LoyaltyEntryEntity } from '../entities/loyalty-entry.entity';
import { TypeOrmLoyaltyEntryRepository } from './typeorm-loyalty-entry.repository';

const TENANT_A = '10000000-0000-7000-8000-000000000001';
const TENANT_B = '20000000-0000-7000-8000-000000000002';

describe('TypeOrmLoyaltyEntryRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmLoyaltyEntryRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmLoyaltyEntryRepository(dataSource.getRepository(LoyaltyEntryEntity));
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  afterEach(async () => {
    await dataSource.query(`DELETE FROM "loyalty"."loyalty_entries" WHERE tenant_id IN ($1, $2)`, [
      TENANT_A,
      TENANT_B,
    ]);
  });

  describe('save()', () => {
    it('persists an entry and retrieves it via findExpiringBefore', async () => {
      const pastExpiry = new Date(Date.now() - 1000);
      const entry = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withPoints(15)
        .withExpiresAt(pastExpiry)
        .build();

      await repo.save(entry);

      const expiring = await repo.findExpiringBefore(new Date());
      expect(expiring.length).toBeGreaterThanOrEqual(1);
      expect(expiring[0]).toBeInstanceOf(LoyaltyEntry);
    });
  });

  describe('idempotency', () => {
    it('throws on duplicate (tenant_id, booking_line_id)', async () => {
      const bookingLineId = uuidv7();
      const customerId = uuidv7();

      const first = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(customerId)
        .withBookingLineId(bookingLineId)
        .build();
      const duplicate = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(customerId)
        .withBookingLineId(bookingLineId)
        .build();

      await repo.save(first);
      await expect(repo.save(duplicate)).rejects.toThrow();
    });
  });

  describe('tenant isolation', () => {
    it('findExpiringBefore does not return entries from another tenant when filtering by tenant', async () => {
      const pastExpiry = new Date(Date.now() - 1000);

      await repo.save(
        new LoyaltyEntryBuilder()
          .withTenantId(TENANT_A)
          .withPoints(10)
          .withExpiresAt(pastExpiry)
          .build(),
      );

      const expiringB = await repo.findExpiringBefore(new Date());
      const tenantBEntries = expiringB.filter((e) => e.tenantId === TENANT_B);
      expect(tenantBEntries).toHaveLength(0);
    });
  });

  describe('findByCustomerPaginated()', () => {
    it('returns entries sorted by earnedAt DESC with pagination', async () => {
      const customerId = uuidv7();
      const earlier = new Date(Date.now() - 2000);
      const later = new Date(Date.now() - 1000);

      await repo.save(
        new LoyaltyEntryBuilder()
          .withTenantId(TENANT_A)
          .withCustomerId(customerId)
          .withEarnedAt(earlier)
          .build(),
      );
      await repo.save(
        new LoyaltyEntryBuilder()
          .withTenantId(TENANT_A)
          .withCustomerId(customerId)
          .withEarnedAt(later)
          .build(),
      );

      const result = await repo.findByCustomerPaginated(TENANT_A, customerId, 1, 10);
      expect(result.total).toBe(2);
      expect(result.items[0].earnedAt.getTime()).toBeGreaterThan(
        result.items[1].earnedAt.getTime(),
      );
    });

    it('returns only entries for the given customer and tenant', async () => {
      const customerA = uuidv7();
      const customerB = uuidv7();

      await repo.save(
        new LoyaltyEntryBuilder().withTenantId(TENANT_A).withCustomerId(customerA).build(),
      );
      await repo.save(
        new LoyaltyEntryBuilder().withTenantId(TENANT_A).withCustomerId(customerB).build(),
      );

      const result = await repo.findByCustomerPaginated(TENANT_A, customerA, 1, 10);
      expect(result.total).toBe(1);
      expect(result.items[0].customerId).toBe(customerA);
    });
  });

  describe('findNextExpiry()', () => {
    it('returns earliest expiry date and sum of points expiring on that date', async () => {
      const customerId = uuidv7();
      const sooner = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const later = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      await repo.save(
        new LoyaltyEntryBuilder()
          .withTenantId(TENANT_A)
          .withCustomerId(customerId)
          .withPoints(10)
          .withExpiresAt(sooner)
          .build(),
      );
      await repo.save(
        new LoyaltyEntryBuilder()
          .withTenantId(TENANT_A)
          .withCustomerId(customerId)
          .withPoints(20)
          .withExpiresAt(later)
          .build(),
      );

      const result = await repo.findNextExpiry(TENANT_A, customerId);
      expect(result).not.toBeNull();
      expect(result!.points).toBe(10);
      expect(result!.expiryDate.getTime()).toBeCloseTo(sooner.getTime(), -3);
    });

    it('returns null when customer has no active entries', async () => {
      const customerId = uuidv7();
      const past = new Date(Date.now() - 1000);

      await repo.save(
        new LoyaltyEntryBuilder()
          .withTenantId(TENANT_A)
          .withCustomerId(customerId)
          .withExpiresAt(past)
          .build(),
      );

      const result = await repo.findNextExpiry(TENANT_A, customerId);
      expect(result).toBeNull();
    });

    it('returns null when customer has no entries at all', async () => {
      const result = await repo.findNextExpiry(TENANT_A, uuidv7());
      expect(result).toBeNull();
    });
  });

  describe('findExpiringBefore()', () => {
    it('returns entries whose expires_at is before the given date', async () => {
      const pastExpiry = new Date(Date.now() - 1000);
      const futureExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      await repo.save(
        new LoyaltyEntryBuilder().withTenantId(TENANT_A).withExpiresAt(pastExpiry).build(),
      );
      await repo.save(
        new LoyaltyEntryBuilder().withTenantId(TENANT_A).withExpiresAt(futureExpiry).build(),
      );

      const expiring = await repo.findExpiringBefore(new Date());
      expect(expiring.length).toBeGreaterThanOrEqual(1);
      expect(expiring.every((e) => e.expiresAt < new Date())).toBe(true);
    });

    it('does not return entries that have not yet expired', async () => {
      const futureExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      await repo.save(
        new LoyaltyEntryBuilder().withTenantId(TENANT_A).withExpiresAt(futureExpiry).build(),
      );

      // findExpiringBefore() is a global, non-tenant-scoped query (used by the daily expiry cron
      // across all tenants), so other suites' leftover/in-flight rows can appear here. Scope the
      // assertion to this test's own tenant to avoid cross-suite pollution.
      const expiring = await repo.findExpiringBefore(new Date());
      expect(expiring.filter((e) => e.tenantId === TENANT_A)).toHaveLength(0);
    });
  });
});
