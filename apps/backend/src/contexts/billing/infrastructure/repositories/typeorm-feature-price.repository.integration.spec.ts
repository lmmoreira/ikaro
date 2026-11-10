import { DataSource, QueryFailedError } from 'typeorm';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { FeaturePriceVersionEntityBuilder } from '../../../../test/builders/billing';
import { createTestDataSource } from '../../../../test/test-datasource';
import { FeaturePriceVersionEntity } from '../entities/feature-price-version.entity';
import { FeaturePriceEntity } from '../entities/feature-price.entity';
import { SeedFeaturePrices1748500000040 } from '../migrations/1748500000040-SeedFeaturePrices';
import { TypeOrmFeaturePriceRepository } from './typeorm-feature-price.repository';

// The seed migration fills the whole natural-key space and runs in every integration database, so
// this spec never inserts a new FeaturePrice: it reads the seeded rows and adds synthetic versions
// dated far in the future, deleting exactly the rows it added (symmetric teardown — the
// Testcontainers database is reused across runs).
describe('TypeOrmFeaturePriceRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmFeaturePriceRepository;
  const addedVersionIds: string[] = [];
  let restoreSelectable: (() => Promise<void>) | null = null;

  const BR = CountryCode.create('BR');
  const US = CountryCode.create('US');
  const dateOf = (value: string): CalendarDate => CalendarDate.create(value);

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmFeaturePriceRepository(
      dataSource.getRepository(FeaturePriceEntity),
      dataSource.getRepository(FeaturePriceVersionEntity),
    );
  });

  afterEach(async () => {
    if (addedVersionIds.length > 0) {
      await dataSource.query(
        `DELETE FROM "billing"."feature_price_versions" WHERE "id" = ANY($1::uuid[])`,
        [addedVersionIds],
      );
      addedVersionIds.length = 0;
    }
    if (restoreSelectable) {
      await restoreSelectable();
      restoreSelectable = null;
    }
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  async function addVersion(
    featurePriceId: string,
    overrides: { amountMinor: number; effectiveFrom: string; supersededAt?: Date | null },
  ): Promise<void> {
    const entity = new FeaturePriceVersionEntityBuilder()
      .withFeaturePriceId(featurePriceId)
      .withAmountMinor(overrides.amountMinor)
      .withEffectiveFrom(overrides.effectiveFrom)
      .withSupersededAt(overrides.supersededAt ?? null)
      .withReason('integration test')
      .build();
    await dataSource.getRepository(FeaturePriceVersionEntity).insert(entity);
    addedVersionIds.push(entity.id);
  }

  describe('seeded catalog', () => {
    const BR_LIST: Array<[string, string, number]> = [
      ['HOTSITE', 'STANDARD', 4900],
      ['BOOKING', 'STANDARD', 10900],
      ['LOYALTY', 'STANDARD', 2900],
      ['CHATBOT', 'BASIC', 3900],
      ['CHATBOT', 'PLUS', 7900],
      ['LEAD_FORM', 'STANDARD', 1900],
    ];

    it.each(BR_LIST)('seeds BR %s/%s at %i minor units', async (featureKey, tier, amountMinor) => {
      const price = await repo.findByNaturalKey(
        featureKey as 'HOTSITE',
        BR,
        tier as 'STANDARD',
        'MONTHLY',
      );

      expect(price).not.toBeNull();
      expect(price!.currency).toBe('BRL');
      expect(price!.selectable).toBe(true);
      expect(price!.versionInForceAt(dateOf('2026-01-01'))?.amount.amountMinor).toBe(amountMinor);
    });

    it('fills every NOT NULL column explicitly on every seeded row', async () => {
      const rows: Array<{
        created_by: string;
        reason: string;
        announced_at: Date | null;
        batch_id: string | null;
        superseded_at: Date | null;
        effective_from: string;
      }> = await dataSource.query(
        `SELECT "created_by", "reason", "announced_at", "batch_id", "superseded_at", "effective_from"::text AS effective_from
             FROM "billing"."feature_price_versions" WHERE "reason" = 'Initial catalog (M25-S02)'`,
      );

      expect(rows.length).toBeGreaterThanOrEqual(6);
      for (const row of rows) {
        expect(row.created_by).toBe('SYSTEM');
        expect(row.reason.length).toBeGreaterThan(0);
        expect(row.announced_at).toBeNull();
        expect(row.batch_id).toBeNull();
        expect(row.superseded_at).toBeNull();
        expect(row.effective_from).toBe('2026-01-01');
      }
    });

    it('seeds the US list', async () => {
      const price = await repo.findByNaturalKey('HOTSITE', US, 'STANDARD', 'MONTHLY');

      expect(price).not.toBeNull();
      expect(price!.currency).toBe('USD');
    });

    it.each([
      ['HOTSITE', 'STANDARD', 6860],
      ['BOOKING', 'STANDARD', 15260],
      ['LOYALTY', 'STANDARD', 4060],
      ['CHATBOT', 'BASIC', 5460],
      ['CHATBOT', 'PLUS', 11060],
      ['LEAD_FORM', 'STANDARD', 2660],
    ])(
      'seeds the US test value for %s/%s (BR + 40%%) at %i',
      async (featureKey, tier, amountMinor) => {
        const price = await repo.findByNaturalKey(
          featureKey as 'HOTSITE',
          US,
          tier as 'STANDARD',
          'MONTHLY',
        );

        expect(price!.versionInForceAt(dateOf('2026-01-01'))?.amount.amountMinor).toBe(amountMinor);
      },
    );

    it('rejects a negative amount at the database (CHECK amount_minor >= 0)', async () => {
      const [{ id }] = await dataSource.query(
        `SELECT "id" FROM "billing"."feature_prices" WHERE "feature_key" = 'HOTSITE' AND "country_code" = 'BR'`,
      );
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.startTransaction();
      try {
        await expect(
          queryRunner.query(
            `INSERT INTO "billing"."feature_price_versions"
               ("id","feature_price_id","amount_minor","effective_from","created_by","reason")
             VALUES (gen_random_uuid(), $1, -1, '2099-01-01', 'SYSTEM', 'negative')`,
            [id],
          ),
        ).rejects.toBeInstanceOf(QueryFailedError);
      } finally {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
      }
    });
  });

  describe('seed migration', () => {
    async function countRows(queryRunner: ReturnType<DataSource['createQueryRunner']>) {
      const [prices] = await queryRunner.query(
        `SELECT count(*)::int AS n FROM "billing"."feature_prices"`,
      );
      const [versions] = await queryRunner.query(
        `SELECT count(*)::int AS n FROM "billing"."feature_price_versions"`,
      );
      const [us] = await queryRunner.query(
        `SELECT count(*)::int AS n FROM "billing"."feature_prices" WHERE "country_code" = 'US'`,
      );
      return { prices: prices.n as number, versions: versions.n as number, us: us.n as number };
    }

    it('is idempotent: running it again changes nothing', async () => {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.startTransaction();
      try {
        const before = await countRows(queryRunner);
        await new SeedFeaturePrices1748500000040().up(queryRunner);
        await new SeedFeaturePrices1748500000040().up(queryRunner);

        expect(await countRows(queryRunner)).toEqual(before);
      } finally {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
      }
    });

    it('seeds the complete BR and US lists on an empty catalog, whatever APP_ENV says', async () => {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.startTransaction();
      const previous = process.env['APP_ENV'];
      try {
        await queryRunner.query(`DELETE FROM "billing"."feature_price_versions"`);
        await queryRunner.query(`DELETE FROM "billing"."feature_prices"`);

        process.env['APP_ENV'] = 'production';
        await new SeedFeaturePrices1748500000040().up(queryRunner);

        expect(await countRows(queryRunner)).toEqual({ prices: 12, versions: 12, us: 6 });
      } finally {
        if (previous === undefined) {
          delete process.env['APP_ENV'];
        } else {
          process.env['APP_ENV'] = previous;
        }
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
      }
    });
  });

  describe('reads by natural key and date', () => {
    it('returns the version whose effective_from is the latest not after the date', async () => {
      const price = await repo.findByNaturalKey('HOTSITE', BR, 'STANDARD', 'MONTHLY');
      await addVersion(price!.id, { amountMinor: 9999, effectiveFrom: '2099-01-01' });

      const reloaded = await repo.findByNaturalKey('HOTSITE', BR, 'STANDARD', 'MONTHLY');

      expect(reloaded!.versionInForceAt(dateOf('2098-12-31'))?.amount.amountMinor).toBe(4900);
      expect(reloaded!.versionInForceAt(dateOf('2099-01-01'))?.amount.amountMinor).toBe(9999);
    });

    it('never returns a superseded version', async () => {
      const price = await repo.findByNaturalKey('HOTSITE', BR, 'STANDARD', 'MONTHLY');
      await addVersion(price!.id, {
        amountMinor: 8888,
        effectiveFrom: '2098-01-01',
        supersededAt: new Date('2026-02-01T00:00:00Z'),
      });
      await addVersion(price!.id, { amountMinor: 9999, effectiveFrom: '2099-01-01' });

      const reloaded = await repo.findByNaturalKey('HOTSITE', BR, 'STANDARD', 'MONTHLY');

      expect(reloaded!.versionInForceAt(dateOf('2098-06-01'))?.amount.amountMinor).toBe(4900);
      expect(reloaded!.versionInForceAt(dateOf('2100-01-01'))?.amount.amountMinor).toBe(9999);
    });

    it('returns null for a natural key that has no row', async () => {
      const price = await repo.findByNaturalKey('HOTSITE', BR, 'PLUS', 'MONTHLY');

      expect(price).toBeNull();
    });

    it('lists only selectable prices for the country', async () => {
      const usLeadForm = await repo.findByNaturalKey('LEAD_FORM', US, 'STANDARD', 'MONTHLY');
      await dataSource.query(
        `UPDATE "billing"."feature_prices" SET "selectable" = false WHERE "id" = $1`,
        [usLeadForm!.id],
      );
      restoreSelectable = async () => {
        await dataSource.query(
          `UPDATE "billing"."feature_prices" SET "selectable" = true WHERE "id" = $1`,
          [usLeadForm!.id],
        );
      };

      const us = await repo.listSelectableByCountry(US);
      const br = await repo.listSelectableByCountry(BR);

      expect(us.map((price) => price.featureKey)).not.toContain('LEAD_FORM');
      expect(us.every((price) => price.countryCode.value === 'US')).toBe(true);
      expect(br.map((price) => price.featureKey)).toContain('LEAD_FORM');
      expect(br).toHaveLength(6);
    });
  });

  describe('tenant isolation (documented exemption)', () => {
    it('has no tenant column on either price table, and no read takes a tenant id', async () => {
      const columns: Array<{ column_name: string }> = await dataSource.query(
        `SELECT "column_name" FROM information_schema.columns
          WHERE table_schema = 'billing' AND table_name IN ('feature_prices','feature_price_versions')
            AND column_name = 'tenant_id'`,
      );

      expect(columns).toHaveLength(0);
      // findByNaturalKey(featureKey, countryCode, tier, cycle) / listSelectableByCountry(countryCode)
      expect(repo.findByNaturalKey).toHaveLength(4);
      expect(repo.listSelectableByCountry).toHaveLength(1);
    });
  });
});
