import { FEATURE_KEYS } from '@ikaro/validation';
import { DataSource, QueryRunner } from 'typeorm';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { createTestDataSource } from '../../../test/test-datasource';
import { LIVE_MERCHANT_PROFILE_KEYS } from '../domain/merchant-profile-key';
import { BackfillExemptSubscriptions1748500000041 } from './migrations/1748500000041-BackfillExemptSubscriptions';

// Every test runs inside a transaction that is rolled back: the Testcontainers database is reused
// across runs and parallel workers, and the backfill acts on *every* tenant without a
// subscription, so nothing it creates may outlive the test. Assertions are scoped to the tenant
// ids the test inserted.
describe('BackfillExemptSubscriptions (integration)', () => {
  const migration = new BackfillExemptSubscriptions1748500000041();
  const originalAppEnv = process.env['APP_ENV'];
  let dataSource: DataSource;
  let runner: QueryRunner;

  // up() reads APP_ENV itself (an unset value means local), exactly as the migration CLI and the
  // dev seed run it.
  async function backfill(appEnv = 'local'): Promise<void> {
    process.env['APP_ENV'] = appEnv;
    await migration.up(runner);
  }

  beforeAll(async () => {
    dataSource = await createTestDataSource();
  });

  beforeEach(async () => {
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
  });

  afterEach(async () => {
    if (originalAppEnv === undefined) {
      delete process.env['APP_ENV'];
    } else {
      process.env['APP_ENV'] = originalAppEnv;
    }
    await runner.rollbackTransaction();
    await runner.release();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  interface TenantInput {
    country?: string;
    timezone?: string;
    settings?: Record<string, unknown>;
    isActive?: boolean;
    createdAt?: string;
  }

  async function insertTenant(input: TenantInput = {}): Promise<string> {
    const id = uuidv7();
    const settings =
      input.settings ??
      ({
        ...(input.country ? { localization: { countryCode: input.country } } : {}),
        ...(input.timezone ? { businessHours: { timezone: input.timezone } } : {}),
      } as Record<string, unknown>);
    await runner.query(
      `INSERT INTO "platform"."tenants" ("id", "name", "slug", "settings", "is_active", "created_at")
       VALUES ($1, $2, $3, $4::jsonb, $5, COALESCE($6::timestamptz, now()))`,
      [
        id,
        `S05 ${id}`,
        `s05-${id}`,
        JSON.stringify(settings),
        input.isActive ?? true,
        input.createdAt ?? null,
      ],
    );
    return id;
  }

  async function subscriptionOf(tenantId: string): Promise<Record<string, unknown>> {
    const rows = (await runner.query(
      `SELECT * FROM "billing"."subscriptions" WHERE "tenant_id" = $1`,
      [tenantId],
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    return rows[0] as Record<string, unknown>;
  }

  async function count(table: string, tenantIds: string[]): Promise<number> {
    const rows = (await runner.query(
      `SELECT count(*)::int AS n FROM "billing"."${table}" WHERE "tenant_id" = ANY($1::uuid[])`,
      [tenantIds],
    )) as Array<{ n: number }>;
    return rows[0]?.n ?? 0;
  }

  it('creates one exempt ACTIVE subscription, five items and an account per tenant', async () => {
    const tenants = [await insertTenant(), await insertTenant({ country: 'US' })];

    await backfill();

    expect(await count('subscriptions', tenants)).toBe(2);
    expect(await count('subscription_items', tenants)).toBe(10);
    expect(await count('billing_accounts', tenants)).toBe(2);
    for (const tenantId of tenants) {
      const sub = await subscriptionOf(tenantId);
      expect(sub).toMatchObject({
        status: 'ACTIVE',
        exempt: true,
        has_ever_paid: false,
        cycle: 'MONTHLY',
        suspension_reason: null,
        trial_ends_at: null,
        current_period_start: null,
        current_period_end: null,
        next_due_date: null,
        past_due_since: null,
        grace_until: null,
        cancel_at: null,
        plan_confirmed_at: null,
        suspended_at: null,
        version: 0,
      });
    }
  });

  it('gives each item the tenant start, no end, SYSTEM as author and CHATBOT at BASIC', async () => {
    const tenantId = await insertTenant({ createdAt: '2026-03-10T12:34:56.789123Z' });

    await backfill();

    const items = (await runner.query(
      `SELECT "feature_key", "tier", "ends_at", "created_by",
              "starts_at" = (SELECT "created_at" FROM "platform"."tenants" WHERE "id" = $1) AS "starts_at_is_tenant_created_at"
         FROM "billing"."subscription_items" WHERE "tenant_id" = $1 ORDER BY "feature_key"`,
      [tenantId],
    )) as Array<Record<string, unknown>>;
    expect(items.map((i) => [i['feature_key'], i['tier']])).toEqual([
      ['BOOKING', 'STANDARD'],
      ['CHATBOT', 'BASIC'],
      ['HOTSITE', 'STANDARD'],
      ['LEAD_FORM', 'STANDARD'],
      ['LOYALTY', 'STANDARD'],
    ]);
    for (const item of items) {
      expect(item['ends_at']).toBeNull();
      expect(item['created_by']).toBe('SYSTEM');
      expect(item['starts_at_is_tenant_created_at']).toBe(true);
    }
  });

  it('grants exactly the features the catalog sells', () => {
    expect([...BackfillExemptSubscriptions1748500000041.FEATURE_KEYS].sort()).toEqual(
      [...FEATURE_KEYS].sort(),
    );
  });

  it('leaves a tenant that already has a subscription untouched, and a re-run changes nothing', async () => {
    const tenantId = await insertTenant();
    await backfill();
    const before = await subscriptionOf(tenantId);
    const itemIdsBefore = (await runner.query(
      `SELECT "id" FROM "billing"."subscription_items" WHERE "tenant_id" = $1 ORDER BY "id"`,
      [tenantId],
    )) as unknown[];

    await backfill();

    expect(await subscriptionOf(tenantId)).toEqual(before);
    expect(
      await runner.query(
        `SELECT "id" FROM "billing"."subscription_items" WHERE "tenant_id" = $1 ORDER BY "id"`,
        [tenantId],
      ),
    ).toEqual(itemIdsBefore);
    expect(await count('billing_accounts', [tenantId])).toBe(1);
  });

  it('on a re-run creates only the new tenant and leaves the first tenants intact', async () => {
    const first = [await insertTenant(), await insertTenant()];
    await backfill();
    const firstSubs = await Promise.all(first.map((id) => subscriptionOf(id)));
    const added = await insertTenant();

    await backfill();

    expect(await count('subscriptions', [...first, added])).toBe(3);
    expect(await count('subscription_items', first)).toBe(10);
    expect(await count('subscription_items', [added])).toBe(5);
    expect(await count('billing_accounts', [...first, added])).toBe(3);
    expect(await Promise.all(first.map((id) => subscriptionOf(id)))).toEqual(firstSubs);
  });

  it('copies each tenant its own country and timezone, with no cross-copy (tenant isolation)', async () => {
    const br = await insertTenant({ country: 'BR', timezone: 'America/Fortaleza' });
    const us = await insertTenant({ country: 'US', timezone: 'America/New_York' });

    await backfill();

    expect(await subscriptionOf(br)).toMatchObject({
      tenant_id: br,
      country_code: 'BR',
      currency: 'BRL',
      timezone: 'America/Fortaleza',
      merchant_profile_key: 'BRL_FAKE',
    });
    expect(await subscriptionOf(us)).toMatchObject({
      tenant_id: us,
      country_code: 'US',
      currency: 'USD',
      timezone: 'America/New_York',
      merchant_profile_key: 'USD_FAKE',
    });
    const itemTenants = (await runner.query(
      `SELECT DISTINCT i."tenant_id" AS "item_tenant", s."tenant_id" AS "sub_tenant"
         FROM "billing"."subscription_items" i
         JOIN "billing"."subscriptions" s ON s."id" = i."subscription_id"
        WHERE i."tenant_id" = ANY($1::uuid[])`,
      [[br, us]],
    )) as Array<{ item_tenant: string; sub_tenant: string }>;
    for (const row of itemTenants) {
      expect(row.item_tenant).toBe(row.sub_tenant);
    }
  });

  it('derives currency from the country spec and looks up no price row', async () => {
    await runner.query(`DELETE FROM "billing"."feature_price_versions"`);
    await runner.query(`DELETE FROM "billing"."feature_prices"`);
    const us = await insertTenant({ country: 'US', timezone: 'America/New_York' });
    const br = await insertTenant({ country: 'BR' });

    await backfill();

    expect(await subscriptionOf(us)).toMatchObject({ currency: 'USD', country_code: 'US' });
    expect(await subscriptionOf(br)).toMatchObject({ currency: 'BRL', country_code: 'BR' });
  });

  it('ignores the display-only settings.localization.currency', async () => {
    const tenantId = await insertTenant({
      settings: { localization: { countryCode: 'BR', currency: 'USD' } },
    });

    await backfill();

    expect(await subscriptionOf(tenantId)).toMatchObject({ currency: 'BRL' });
  });

  it('backfills a sparse settings blob as BR with that country default timezone', async () => {
    const empty = await insertTenant({ settings: {} });
    const noBusinessHours = await insertTenant({ settings: { localization: { language: 'en' } } });

    await backfill();

    for (const tenantId of [empty, noBusinessHours]) {
      expect(await subscriptionOf(tenantId)).toMatchObject({
        country_code: 'BR',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
      });
    }
  });

  it('uses a fake or sandbox merchant profile key, never a live one outside production', async () => {
    const env: Array<['local' | 'staging', string, string]> = [
      ['local', 'BRL_FAKE', 'USD_FAKE'],
      ['staging', 'BRL_ASAAS_SANDBOX', 'USD_STRIPE_TEST'],
    ];
    for (const [appEnv, brKey, usKey] of env) {
      const br = await insertTenant({ country: 'BR' });
      const us = await insertTenant({ country: 'US', timezone: 'America/New_York' });

      await backfill(appEnv);

      const brSub = await subscriptionOf(br);
      const usSub = await subscriptionOf(us);
      expect(brSub['merchant_profile_key']).toBe(brKey);
      expect(usSub['merchant_profile_key']).toBe(usKey);
      expect(LIVE_MERCHANT_PROFILE_KEYS).not.toContain(brSub['merchant_profile_key']);
      expect(LIVE_MERCHANT_PROFILE_KEYS).not.toContain(usSub['merchant_profile_key']);
    }
  });

  describe('anchor_day', () => {
    const cases: Array<[string, string, string, number]> = [
      [
        '31st of a 31-day month (Jan 31 + 14 = Feb 14)',
        '2026-01-31T15:00:00Z',
        'America/Sao_Paulo',
        14,
      ],
      ['15th (15 + 14 = 29 clamps to 28)', '2026-01-15T15:00:00Z', 'America/Sao_Paulo', 28],
      [
        '20th of a 31-day month (Jan 20 + 14 = Feb 3)',
        '2026-01-20T15:00:00Z',
        'America/Sao_Paulo',
        3,
      ],
      [
        'a UTC day later than the tenant-local day (Jan 31 23:00 local + 14 = Feb 14, not 15)',
        '2026-02-01T02:00:00Z',
        'America/Sao_Paulo',
        14,
      ],
    ];

    it.each(cases)('%s', async (_label, createdAt, timezone, expected) => {
      const tenantId = await insertTenant({ createdAt, timezone });

      await backfill();

      const sub = await subscriptionOf(tenantId);
      expect(sub['anchor_day']).toBe(expected);
      expect(expected).toBeGreaterThanOrEqual(1);
      expect(expected).toBeLessThanOrEqual(28);
    });
  });

  it('backfills an inactive tenant and leaves is_active unchanged', async () => {
    const tenantId = await insertTenant({ isActive: false });

    await backfill();

    expect(await count('subscriptions', [tenantId])).toBe(1);
    const rows = (await runner.query(
      `SELECT "is_active" FROM "platform"."tenants" WHERE "id" = $1`,
      [tenantId],
    )) as Array<{ is_active: boolean }>;
    expect(rows[0]?.is_active).toBe(false);
  });

  describe('bad data aborts loudly and inserts nothing', () => {
    it('names a tenant with an unsupported country', async () => {
      const good = await insertTenant({ country: 'BR' });
      const bad = await insertTenant({ country: 'AR' });

      await expect(backfill()).rejects.toThrow(bad);

      expect(await count('subscriptions', [good, bad])).toBe(0);
      expect(await count('subscription_items', [good, bad])).toBe(0);
      expect(await count('billing_accounts', [good, bad])).toBe(0);
    });

    it('names a tenant with an invalid timezone', async () => {
      const good = await insertTenant({ country: 'BR' });
      const bad = await insertTenant({ country: 'BR', timezone: 'Mars/Olympus_Mons' });

      await expect(backfill()).rejects.toThrow(bad);

      expect(await count('subscriptions', [good, bad])).toBe(0);
      expect(await count('billing_accounts', [good, bad])).toBe(0);
    });
  });

  describe('up()', () => {
    it('reads an unset APP_ENV as local', async () => {
      delete process.env['APP_ENV'];
      const tenantId = await insertTenant({ country: 'BR' });

      await migration.up(runner);

      expect(await subscriptionOf(tenantId)).toMatchObject({ merchant_profile_key: 'BRL_FAKE' });
    });

    it('refuses an unknown APP_ENV', async () => {
      process.env['APP_ENV'] = 'qa';
      const tenantId = await insertTenant({ country: 'BR' });

      await expect(migration.up(runner)).rejects.toThrow(/APP_ENV/);

      expect(await count('subscriptions', [tenantId])).toBe(0);
    });
  });

  describe('seeded tenants', () => {
    // The dev seed inserts its tenants after the migrations ran and then calls the same function.
    it('gives a seeded US tenant and BR tenants their subscription, items and account', async () => {
      const ikaro = await insertTenant({ country: 'US', timezone: 'America/New_York' });
      const brA = await insertTenant({ country: 'BR', timezone: 'America/Sao_Paulo' });
      const brB = await insertTenant({ country: 'BR', timezone: 'America/Sao_Paulo' });
      const team = await insertTenant({ country: 'BR', timezone: 'America/Sao_Paulo' });
      const all = [ikaro, brA, brB, team];

      await backfill();
      await backfill();

      expect(await count('subscriptions', all)).toBe(4);
      expect(await count('subscription_items', all)).toBe(20);
      expect(await count('billing_accounts', all)).toBe(4);
      expect(await subscriptionOf(ikaro)).toMatchObject({
        country_code: 'US',
        currency: 'USD',
        timezone: 'America/New_York',
        merchant_profile_key: 'USD_FAKE',
        exempt: true,
        status: 'ACTIVE',
      });
    });
  });
});
