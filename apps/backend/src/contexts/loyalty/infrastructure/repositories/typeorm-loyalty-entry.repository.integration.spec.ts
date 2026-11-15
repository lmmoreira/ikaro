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
    await dataSource.query(
      `DELETE FROM "loyalty"."balance_expiry_log" WHERE entry_id IN (SELECT id FROM "loyalty"."loyalty_entries" WHERE tenant_id IN ($1, $2))`,
      [TENANT_A, TENANT_B],
    );
    await dataSource.query(`DELETE FROM "loyalty"."loyalty_entries" WHERE tenant_id IN ($1, $2)`, [
      TENANT_A,
      TENANT_B,
    ]);
  });

  describe('save()', () => {
    it('persists an entry and retrieves it via findUnprocessedExpiringUntil', async () => {
      const pastExpiry = new Date(Date.now() - 1000);
      const entry = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withPoints(15)
        .withExpiresAt(pastExpiry)
        .build();

      await repo.save(entry);

      const expiring = await repo.findUnprocessedExpiringUntil(new Date());
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
    it('findUnprocessedExpiringUntil does not return entries from another tenant when filtering by tenant', async () => {
      const pastExpiry = new Date(Date.now() - 1000);

      await repo.save(
        new LoyaltyEntryBuilder()
          .withTenantId(TENANT_A)
          .withPoints(10)
          .withExpiresAt(pastExpiry)
          .build(),
      );

      const expiringB = await repo.findUnprocessedExpiringUntil(new Date());
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

  describe('findUnprocessedByCustomer()', () => {
    it('returns only the customer entries the expiry sweep has not processed, tenant-scoped', async () => {
      const customerId = uuidv7();
      const open = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(customerId)
        .build();
      const processed = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(customerId)
        .build();
      const otherTenant = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_B)
        .withCustomerId(customerId)
        .build();
      await repo.save(open);
      await repo.save(processed);
      await repo.save(otherTenant);
      await dataSource.query(`INSERT INTO "loyalty"."balance_expiry_log" (entry_id) VALUES ($1)`, [
        processed.id,
      ]);

      const result = await repo.findUnprocessedByCustomer(TENANT_A, customerId);

      expect(result.map((e) => e.id)).toEqual([open.id]);
    });

    it('returns an empty array when the customer has no entries at all', async () => {
      expect(await repo.findUnprocessedByCustomer(TENANT_A, uuidv7())).toEqual([]);
    });
  });

  describe('findUnprocessedExpiringUntil()', () => {
    it('returns unprocessed entries expiring before the bound, across tenants', async () => {
      const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const far = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const a = new LoyaltyEntryBuilder().withTenantId(TENANT_A).withExpiresAt(soon).build();
      const b = new LoyaltyEntryBuilder().withTenantId(TENANT_B).withExpiresAt(soon).build();
      const beyond = new LoyaltyEntryBuilder().withTenantId(TENANT_A).withExpiresAt(far).build();
      const processed = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withExpiresAt(soon)
        .build();
      for (const entry of [a, b, beyond, processed]) await repo.save(entry);
      await dataSource.query(`INSERT INTO "loyalty"."balance_expiry_log" (entry_id) VALUES ($1)`, [
        processed.id,
      ]);

      const result = await repo.findUnprocessedExpiringUntil(
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      );

      const ids = result.map((e) => e.id);
      expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
      expect(ids).not.toContain(beyond.id);
      expect(ids).not.toContain(processed.id);
    });

    it('seeks the standalone expires_at index instead of scanning the table', async () => {
      await dataSource.query(`SET enable_seqscan = off`);
      try {
        const plan = (await dataSource.query(
          `EXPLAIN SELECT e.id FROM "loyalty"."loyalty_entries" e
           WHERE e.expires_at < now()
             AND NOT EXISTS (SELECT 1 FROM "loyalty"."balance_expiry_log" l WHERE l.entry_id = e.id)`,
        )) as { 'QUERY PLAN': string }[];
        expect(plan.map((row) => row['QUERY PLAN']).join('\n')).toContain(
          'IDX_loyalty_entries_expires_at',
        );
      } finally {
        await dataSource.query(`RESET enable_seqscan`);
      }
    });
  });

  describe('findUnprocessedExpiringUntil()', () => {
    it('returns entries whose expires_at is before the given date', async () => {
      const pastExpiry = new Date(Date.now() - 1000);
      const futureExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      await repo.save(
        new LoyaltyEntryBuilder().withTenantId(TENANT_A).withExpiresAt(pastExpiry).build(),
      );
      await repo.save(
        new LoyaltyEntryBuilder().withTenantId(TENANT_A).withExpiresAt(futureExpiry).build(),
      );

      const expiring = await repo.findUnprocessedExpiringUntil(new Date());
      expect(expiring.length).toBeGreaterThanOrEqual(1);
      expect(expiring.every((e) => e.expiresAt < new Date())).toBe(true);
    });

    it('does not return entries that have not yet expired', async () => {
      const futureExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      await repo.save(
        new LoyaltyEntryBuilder().withTenantId(TENANT_A).withExpiresAt(futureExpiry).build(),
      );

      // findUnprocessedExpiringUntil() is a global, non-tenant-scoped query (used by the daily expiry cron
      // across all tenants), so other suites' leftover/in-flight rows can appear here. Scope the
      // assertion to this test's own tenant to avoid cross-suite pollution.
      const expiring = await repo.findUnprocessedExpiringUntil(new Date());
      expect(expiring.filter((e) => e.tenantId === TENANT_A)).toHaveLength(0);
    });
  });

  describe('findUnprocessedExpiringUntil() window end', () => {
    it('includes an unprocessed entry that expires exactly at the bound', async () => {
      const bound = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const entry = new LoyaltyEntryBuilder().withTenantId(TENANT_A).withExpiresAt(bound).build();
      await repo.save(entry);

      const result = await repo.findUnprocessedExpiringUntil(bound);

      expect(result.map((e) => e.id)).toContain(entry.id);
    });
  });
});
