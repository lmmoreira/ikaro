import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { createTestDataSource } from '../../../../test/test-datasource';
import {
  BalanceExpiryLogEntityBuilder,
  LoyaltyEntryBuilder,
} from '../../../../test/builders/loyalty/index';
import { LoyaltyEntry } from '../../domain/loyalty-entry.aggregate';
import { BalanceExpiryLogEntity } from '../entities/balance-expiry-log.entity';
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
    it('persists an entry and retrieves it via findUnprocessedDueBetween', async () => {
      const pastExpiry = new Date(Date.now() - 1000);
      const entry = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withPoints(15)
        .withExpiresAt(pastExpiry)
        .build();

      await repo.save(entry);

      const due = await repo.findUnprocessedDueBetween(null, new Date());
      const saved = due.find((e) => e.id === entry.id);
      expect(saved).toBeInstanceOf(LoyaltyEntry);
      expect(saved?.points).toBe(15);
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

  // findUnprocessedDueBetween() and findExpiringSoon() are global, non-tenant-scoped reads (the
  // daily and weekly crons span every tenant), so other suites' leftover rows can appear in their
  // results. Every assertion below is scoped to this spec's own tenants and entry ids.
  describe('findUnprocessedDueBetween()', () => {
    const TO = new Date('2031-06-01T02:00:00.000Z');
    const FROM = new Date('2031-05-30T02:00:00.000Z');
    const at = (iso: string): Date => new Date(iso);

    async function seed(tenantId: string, expiresAt: Date) {
      const entry = new LoyaltyEntryBuilder()
        .withTenantId(tenantId)
        .withExpiresAt(expiresAt)
        .build();
      await repo.save(entry);
      return entry;
    }

    async function dueIds(from: Date | null, to: Date): Promise<string[]> {
      const due = await repo.findUnprocessedDueBetween(from, to);
      return due.filter((e) => [TENANT_A, TENANT_B].includes(e.tenantId)).map((e) => e.id);
    }

    it('returns unprocessed entries across tenants', async () => {
      const a = await seed(TENANT_A, at('2031-05-31T12:00:00.000Z'));
      const b = await seed(TENANT_B, at('2031-05-31T13:00:00.000Z'));

      expect(await dueIds(FROM, TO)).toEqual(expect.arrayContaining([a.id, b.id]));
    });

    it('excludes entries already in the expiry log', async () => {
      const processed = await seed(TENANT_A, at('2031-05-31T12:00:00.000Z'));
      const pending = await seed(TENANT_A, at('2031-05-31T13:00:00.000Z'));
      await dataSource
        .getRepository(BalanceExpiryLogEntity)
        .insert(new BalanceExpiryLogEntityBuilder().withEntryId(processed.id).build());

      const ids = await dueIds(FROM, TO);

      expect(ids).toContain(pending.id);
      expect(ids).not.toContain(processed.id);
    });

    it('includes an entry that expires exactly at the upper bound and excludes one after it', async () => {
      const atBound = await seed(TENANT_A, TO);
      const afterBound = await seed(TENANT_A, new Date(TO.getTime() + 1000));

      const ids = await dueIds(FROM, TO);

      expect(ids).toContain(atBound.id);
      expect(ids).not.toContain(afterBound.id);
    });

    it('excludes an entry that expires exactly at the lower bound and everything before it', async () => {
      const atFrom = await seed(TENANT_A, FROM);
      const beforeFrom = await seed(TENANT_A, new Date(FROM.getTime() - 1000));
      const inside = await seed(TENANT_A, new Date(FROM.getTime() + 1000));

      const ids = await dueIds(FROM, TO);

      expect(ids).toContain(inside.id);
      expect(ids).not.toContain(atFrom.id);
      expect(ids).not.toContain(beforeFrom.id);
    });

    it('has no lower bound when from is null', async () => {
      const old = await seed(TENANT_A, at('2031-01-01T00:00:00.000Z'));

      expect(await dueIds(null, TO)).toContain(old.id);
    });

    it('does not return entries that are not yet due', async () => {
      const notDue = await seed(TENANT_A, new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

      expect(await dueIds(null, new Date())).not.toContain(notDue.id);
    });
  });

  describe('findExpiringSoon()', () => {
    it('returns entries inside the window across tenants and nothing outside it', async () => {
      const from = new Date('2032-01-01T00:00:00.000Z');
      const to = new Date('2032-01-08T00:00:00.000Z');
      const inA = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withExpiresAt(new Date('2032-01-03T00:00:00.000Z'))
        .build();
      const inB = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_B)
        .withExpiresAt(new Date('2032-01-05T00:00:00.000Z'))
        .build();
      const outside = new LoyaltyEntryBuilder()
        .withTenantId(TENANT_A)
        .withExpiresAt(new Date('2032-02-01T00:00:00.000Z'))
        .build();
      for (const entry of [inA, inB, outside]) await repo.save(entry);

      const ids = (await repo.findExpiringSoon(from, to)).map((e) => e.id);

      expect(ids).toEqual(expect.arrayContaining([inA.id, inB.id]));
      expect(ids).not.toContain(outside.id);
    });
  });

  // The cross-tenant reads filter on expires_at alone, so they can only seek the standalone index
  // (every other index leads with tenant_id). enable_seqscan = off makes the planner take any usable
  // index, which turns "an index exists for this predicate" into an assertion on the plan.
  describe('IDX_loyalty_entries_expires_at', () => {
    async function explain(sql: string, params: unknown[]): Promise<string> {
      const queryRunner = dataSource.createQueryRunner();
      try {
        await queryRunner.query('SET enable_seqscan = off');
        const rows = (await queryRunner.query(`EXPLAIN ${sql}`, params)) as Record<
          string,
          string
        >[];
        return rows.map((row) => row['QUERY PLAN']).join('\n');
      } finally {
        await queryRunner.query('RESET enable_seqscan');
        await queryRunner.release();
      }
    }

    it('serves the sweep read (expires_at <= :to with NOT EXISTS) without a sequential scan', async () => {
      const plan = await explain(
        `SELECT e.id FROM loyalty.loyalty_entries e
         WHERE e.expires_at <= $1 AND e.expires_at > $2
           AND NOT EXISTS (SELECT 1 FROM loyalty.balance_expiry_log l WHERE l.entry_id = e.id)`,
        [new Date('2031-06-01T02:00:00.000Z'), new Date('2031-05-30T02:00:00.000Z')],
      );

      expect(plan).toContain('IDX_loyalty_entries_expires_at');
    });

    it('serves the warning window read (expires_at between two instants)', async () => {
      const plan = await explain(
        `SELECT e.id FROM loyalty.loyalty_entries e WHERE e.expires_at BETWEEN $1 AND $2`,
        [new Date('2032-01-01T00:00:00.000Z'), new Date('2032-01-08T00:00:00.000Z')],
      );

      expect(plan).toContain('IDX_loyalty_entries_expires_at');
    });
  });
});
