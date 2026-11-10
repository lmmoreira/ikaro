import { countrySpec } from '@ikaro/i18n';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { resolveAppEnv } from '../../../../shared/database/resolve-app-env';
import { resolveMerchantProfileKey } from '../../domain/merchant-profile-key';

// M25-S05 (UC-126) — data migration, no schema change (billing tables created by
// CreateBillingSchema1748500000039). Gives every tenant that has no subscription an ACTIVE,
// `exempt` one with five open-ended items and a billing-account shell, so enforcement ships dark:
// nothing changes for any user and no tenant can lack a row once code that reads it ships.
//
// The dev seed (apps/backend/src/shared/database/seed.ts) calls `up()` again after it inserts its
// tenants, because seeded tenants are inserted *after* the migrations ran. Keeping the SQL here,
// inside the migration, freezes it with the migration — a later schema change cannot break a
// fresh-database migration run through a shared helper. This file exports ONLY the migration
// class: TypeORM's loader calls `new` on every exported function in a migration file.
//
// Idempotent: the subscription insert is `ON CONFLICT (tenant_id) DO NOTHING`, and the items and
// the account are inserted only for a subscription this run created, so a re-run (or a tenant
// that already has a subscription) changes nothing.

// The five sellable features and the tier each starts with. Local on purpose: frozen with this
// migration, so a feature added to the catalog later is not silently granted by a re-run of it.
const EXEMPT_ITEMS: ReadonlyArray<{ featureKey: string; tier: string }> = [
  { featureKey: 'HOTSITE', tier: 'STANDARD' },
  { featureKey: 'BOOKING', tier: 'STANDARD' },
  { featureKey: 'LOYALTY', tier: 'STANDARD' },
  { featureKey: 'CHATBOT', tier: 'BASIC' },
  { featureKey: 'LEAD_FORM', tier: 'STANDARD' },
];

const TRIAL_DAYS = 14;
const ANCHOR_DAY_MAX = 28;
const DEFAULT_COUNTRY_CODE = 'BR';

interface TenantWithoutSubscription {
  id: string;
  country_code: string | null;
  timezone: string | null;
}

interface PlannedSubscription {
  tenantId: string;
  countryCode: string;
  currency: string;
  timezone: string;
  merchantProfileKey: string;
}

/**
 * Creates the exempt subscription, its items and its billing account for every tenant without a
 * subscription, and returns how many it created. Reads `platform.tenants` with SQL — a data
 * migration, not an application port. Every tenant is validated before the first write, so bad
 * data aborts the run with nothing inserted.
 */
async function backfillExemptSubscriptions(runner: QueryRunner, appEnv: string): Promise<number> {
  const tenants = (await runner.query(
    `SELECT t."id",
            t."settings"->'localization'->>'countryCode' AS "country_code",
            t."settings"->'businessHours'->>'timezone'   AS "timezone"
       FROM "platform"."tenants" t
      WHERE NOT EXISTS (
        SELECT 1 FROM "billing"."subscriptions" s WHERE s."tenant_id" = t."id"
      )
      ORDER BY t."created_at", t."id"`,
  )) as TenantWithoutSubscription[];

  const plan: PlannedSubscription[] = [];
  for (const tenant of tenants) {
    plan.push(await planSubscription(runner, tenant, appEnv));
  }

  let created = 0;
  for (const subscription of plan) {
    if (await insertSubscription(runner, subscription)) {
      created += 1;
    }
  }
  return created;
}

async function planSubscription(
  runner: QueryRunner,
  tenant: TenantWithoutSubscription,
  appEnv: string,
): Promise<PlannedSubscription> {
  // A missing key falls back to BR and that country's default timezone; a key that is present
  // but unusable is bad data and aborts, naming the tenant.
  const countryCode = tenant.country_code ?? DEFAULT_COUNTRY_CODE;
  let merchantProfileKey: string;
  try {
    merchantProfileKey = resolveMerchantProfileKey(appEnv, countryCode);
  } catch (error) {
    throw new Error(
      `BackfillExemptSubscriptions: tenant ${tenant.id} has no usable billing country ` +
        `(countryCode="${countryCode}", APP_ENV="${appEnv}")`,
      { cause: error },
    );
  }
  const spec = countrySpec(countryCode);
  const timezone = tenant.timezone ?? spec.defaultTimezone;
  const known = (await runner.query(`SELECT 1 FROM pg_timezone_names WHERE name = $1 LIMIT 1`, [
    timezone,
  ])) as unknown[];
  if (known.length === 0) {
    throw new Error(
      `BackfillExemptSubscriptions: tenant ${tenant.id} has an invalid timezone "${timezone}"`,
    );
  }
  return {
    tenantId: tenant.id,
    countryCode,
    currency: spec.currency,
    timezone,
    merchantProfileKey,
  };
}

async function insertSubscription(
  runner: QueryRunner,
  subscription: PlannedSubscription,
): Promise<boolean> {
  // anchor_day: the day-of-month, in the tenant's timezone, of created_at + 14 days, clamped to
  // 28 — the trial-end-day rule the Subscription aggregate (S08) and the new-tenant handler
  // (S11) apply, so it is a real day 1-28 and not a placeholder.
  const inserted = (await runner.query(
    `INSERT INTO "billing"."subscriptions"
       ("id", "tenant_id", "status", "country_code", "currency", "timezone",
        "merchant_profile_key", "cycle", "anchor_day", "has_ever_paid", "exempt")
     SELECT $1::uuid, t."id", 'ACTIVE', $3::text, $4::text, $5::text, $6::text, 'MONTHLY',
            LEAST(
              ${ANCHOR_DAY_MAX},
              EXTRACT(DAY FROM ((t."created_at" AT TIME ZONE $5::text)
                                + interval '${TRIAL_DAYS} days'))::int
            ),
            false, true
       FROM "platform"."tenants" t
      WHERE t."id" = $2
     ON CONFLICT ("tenant_id") DO NOTHING
     RETURNING "id"`,
    [
      uuidv7(),
      subscription.tenantId,
      subscription.countryCode,
      subscription.currency,
      subscription.timezone,
      subscription.merchantProfileKey,
    ],
  )) as Array<{ id: string }>;

  const row = inserted[0];
  if (row === undefined) {
    return false;
  }

  // Items start when the tenant did (created_at), so the start instant matches the one the
  // aggregate derives anchorDay from. created_at is read in SQL to keep microsecond precision.
  await runner.query(
    `INSERT INTO "billing"."subscription_items"
       ("id", "tenant_id", "subscription_id", "feature_key", "tier",
        "starts_at", "ends_at", "created_by")
     SELECT i."id", t."id", $2::uuid, i."feature_key", i."tier", t."created_at", NULL, 'SYSTEM'
       FROM "platform"."tenants" t
      CROSS JOIN unnest($3::uuid[], $4::text[], $5::text[]) AS i("id", "feature_key", "tier")
      WHERE t."id" = $1`,
    [
      subscription.tenantId,
      row.id,
      EXEMPT_ITEMS.map(() => uuidv7()),
      EXEMPT_ITEMS.map((item) => item.featureKey),
      EXEMPT_ITEMS.map((item) => item.tier),
    ],
  );
  await runner.query(
    `INSERT INTO "billing"."billing_accounts" ("id", "tenant_id")
     VALUES ($1, $2)
     ON CONFLICT ("tenant_id") DO NOTHING`,
    [uuidv7(), subscription.tenantId],
  );
  return true;
}

export class BackfillExemptSubscriptions1748500000041 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // An unset APP_ENV means `local` inside a migration; an unknown value throws (S07 rule).
    await backfillExemptSubscriptions(queryRunner, resolveAppEnv(process.env));
  }

  // Deliberately a no-op: the rows are indistinguishable from subscriptions created later by
  // provisioning (S11) or edited by an operator, so deleting them could destroy live billing
  // data. Rolling back past this migration drops the whole `billing` schema anyway
  // (CreateBillingSchema1748500000039.down), and re-running up() is idempotent.
  public async down(): Promise<void> {
    return;
  }
}
