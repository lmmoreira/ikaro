import { MigrationInterface, QueryRunner } from 'typeorm';
import { resolveAppEnv } from '../../../../shared/database/resolve-app-env';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';

// Seeds the launch price list (M25-S04) — docs/DATABASE_SCHEMA.md § `billing.feature_prices` /
// `feature_price_versions`. Expand only: new rows in tables M25-S03 created.
//
// Idempotent on purpose: the price row is upserted on its natural key and its first version is
// inserted only when that price has no version yet, so a re-run changes nothing — even on another
// day, because the effective date is a fixed constant, not the run date (which would otherwise
// add a second live version: the unique index is (price, effective_from) among live versions).

// Every price in force from this date. Fixed, so every environment seeds identical rows; any real
// service-period start is on or after it.
const SEED_EFFECTIVE_FROM = '2026-01-01';
const SEED_REASON = 'Initial catalog (M25-S02)';

interface SeedPrice {
  featureKey: string;
  tier: string;
  amountMinor: number;
}

// Launch BR list (monthly, tax-inclusive), settled in M25-S02: HOTSITE R$ 49, BOOKING R$ 109
// (recurrence and availability alerts included), LOYALTY R$ 29, CHATBOT Básico R$ 39 / Plus R$ 79,
// LEAD_FORM R$ 19.
const BR_PRICES: SeedPrice[] = [
  { featureKey: 'HOTSITE', tier: 'STANDARD', amountMinor: 4900 },
  { featureKey: 'BOOKING', tier: 'STANDARD', amountMinor: 10900 },
  { featureKey: 'LOYALTY', tier: 'STANDARD', amountMinor: 2900 },
  { featureKey: 'CHATBOT', tier: 'BASIC', amountMinor: 3900 },
  { featureKey: 'CHATBOT', tier: 'PLUS', amountMinor: 7900 },
  { featureKey: 'LEAD_FORM', tier: 'STANDARD', amountMinor: 1900 },
];

// NON-PRODUCTION placeholder: the US list stays staging-only until Stripe's real fees are
// confirmed (UC-112, M28), so these amounts are test values, never a commercial decision.
const US_PRICES: SeedPrice[] = BR_PRICES.map((price) => ({ ...price }));

export class SeedFeaturePrices1748500000040 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // The migration reads process.env directly (no Nest config); unset means `local`, an unknown
    // value throws, so a typo can never take the production branch.
    const includeUs = resolveAppEnv(process.env) !== 'production';

    await this.seedCountry(queryRunner, 'BR', 'BRL', BR_PRICES);
    if (includeUs) {
      await this.seedCountry(queryRunner, 'US', 'USD', US_PRICES);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only what this migration inserted: SYSTEM-created versions with the seed reason, then any
    // price left without a version. An operator-created price or version is never touched.
    await queryRunner.query(
      `DELETE FROM "billing"."feature_price_versions" WHERE "created_by" = 'SYSTEM' AND "reason" = $1`,
      [SEED_REASON],
    );
    await queryRunner.query(`
      DELETE FROM "billing"."feature_prices" fp
      WHERE NOT EXISTS (
        SELECT 1 FROM "billing"."feature_price_versions" v WHERE v."feature_price_id" = fp."id"
      )
    `);
  }

  private async seedCountry(
    queryRunner: QueryRunner,
    countryCode: string,
    currency: string,
    prices: SeedPrice[],
  ): Promise<void> {
    for (const price of prices) {
      await queryRunner.query(
        `INSERT INTO "billing"."feature_prices"
           ("id", "feature_key", "country_code", "tier", "cycle", "currency", "selectable")
         VALUES ($1, $2, $3, $4, 'MONTHLY', $5, true)
         ON CONFLICT ON CONSTRAINT "UQ_billing_feature_prices_key" DO NOTHING`,
        [uuidv7(), price.featureKey, countryCode, price.tier, currency],
      );
      await queryRunner.query(
        `INSERT INTO "billing"."feature_price_versions"
           ("id", "feature_price_id", "amount_minor", "effective_from", "announced_at",
            "created_by", "reason", "superseded_at", "batch_id")
         SELECT $1, fp."id", $2, $3, NULL, 'SYSTEM', $4, NULL, NULL
         FROM "billing"."feature_prices" fp
         WHERE fp."feature_key" = $5 AND fp."country_code" = $6 AND fp."tier" = $7
           AND fp."cycle" = 'MONTHLY'
           AND NOT EXISTS (
             SELECT 1 FROM "billing"."feature_price_versions" v WHERE v."feature_price_id" = fp."id"
           )`,
        [
          uuidv7(),
          price.amountMinor,
          SEED_EFFECTIVE_FROM,
          SEED_REASON,
          price.featureKey,
          countryCode,
          price.tier,
        ],
      );
    }
  }
}
