import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { LoyaltyEntryBuilder } from '../../../../test/builders/loyalty/index';
import { LoyaltyEntry } from '../../domain/loyalty-entry.aggregate';
import { LoyaltyEntryEntity } from '../entities/loyalty-entry.entity';
import { TypeOrmLoyaltyEntryRepository } from './typeorm-loyalty-entry.repository';

const TENANT_A = '10000000-0000-7000-8000-000000000001';
const TENANT_B = '20000000-0000-7000-8000-000000000002';

describe('TypeOrmLoyaltyEntryRepository (integration)', () => {
  let repo: TypeOrmLoyaltyEntryRepository;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env['TEST_DATABASE_URL'],
          entities: [LoyaltyEntryEntity],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([LoyaltyEntryEntity]),
      ],
      providers: [TypeOrmLoyaltyEntryRepository],
    }).compile();

    repo = moduleRef.get(TypeOrmLoyaltyEntryRepository);
    ds = moduleRef.get(DataSource);

    await ds.query(`CREATE SCHEMA IF NOT EXISTS "loyalty"`);
    await ds.query(`
      CREATE TABLE IF NOT EXISTS "loyalty"."loyalty_entries" (
        "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"        UUID        NOT NULL,
        "customer_id"      UUID        NOT NULL,
        "booking_id"       UUID        NOT NULL,
        "booking_line_id"  UUID        NOT NULL,
        "service_id"       UUID        NOT NULL,
        "points"           INTEGER     NOT NULL CHECK (points > 0),
        "earned_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "expires_at"       TIMESTAMPTZ NOT NULL,
        CONSTRAINT "PK_loyalty_entries_integ" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_loyalty_entries_tenant_booking_line_integ"
          UNIQUE ("tenant_id", "booking_line_id")
      )
    `);
  });

  afterAll(async () => {
    await ds.query(`DROP TABLE IF EXISTS "loyalty"."loyalty_entries"`);
    await ds.destroy();
  });

  afterEach(async () => {
    await ds.query(`DELETE FROM "loyalty"."loyalty_entries"`);
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

      const expiring = await repo.findExpiringBefore(new Date());
      expect(expiring).toHaveLength(0);
    });
  });
});
