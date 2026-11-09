import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { createTestDataSource } from '../../../test/test-datasource';
import { appRoleGrantSql } from './billing-schema-grants';
import { CreateBillingSchema1748500000039 } from './migrations/1748500000039-CreateBillingSchema';

// M25-S03: the first Billing migration. The schema is created once by integration-global-setup;
// this spec checks it against docs/DATABASE_SCHEMA.md § Schema: `billing` (columns, every named
// index and constraint), then each constraint that must reject a bad row, the app-role grants and
// the down()/up() round trip (the last test, so it leaves the schema as it found it).
const COLUMNS: Record<string, string> = {
  feature_prices:
    'id feature_key country_code tier cycle currency selectable created_at updated_at',
  feature_price_versions:
    'id feature_price_id amount_minor effective_from announced_at created_by reason superseded_at batch_id created_at',
  billing_accounts:
    'id tenant_id tax_id_type tax_id legal_name billing_email address provider provider_customer_id auto_billing auto_billing_status auto_billing_label terms_version terms_accepted_at terms_accepted_by created_at updated_at',
  subscriptions:
    'id tenant_id status suspension_reason country_code currency timezone merchant_profile_key cycle anchor_day trial_ends_at current_period_start current_period_end next_due_date past_due_since grace_until cancel_at plan_confirmed_at suspended_at purge_warning_30_sent_at purge_warning_7_sent_at has_ever_paid exempt version created_at updated_at',
  subscription_items:
    'id tenant_id subscription_id feature_key tier starts_at ends_at created_by created_at',
  charges:
    'id tenant_id subscription_id kind period_start period_end due_date subtotal_minor amount_minor currency merchant_profile_key status method paid_at provider provider_charge_id payment_url payment_url_expires_at receipt_url payment_return_seen_at refunded_amount_minor provider_creation_status provider_creation_attempts provider_creation_last_attempt_at provider_cancel_pending created_at updated_at',
  charge_lines: 'id tenant_id charge_id feature_key tier unit_price_minor',
  provider_events: 'provider event_id tenant_id event_type received_at processed_at',
  signup_registrations:
    'id tenant_id source status google_sub tax_id_type tax_id terms_version terms_accepted_at created_at',
  tenant_purge_jobs:
    'id tenant_id reason status requested_at completed_at last_error created_at updated_at',
  tenant_purge_steps: 'tenant_id job_id participant completed_at metadata',
  provider_health:
    'merchant_profile_key last_reconcile_ok_at last_full_reconcile_at webhook_status freeze_active freeze_since updated_at',
  operator_audit: 'id tenant_id actor action payload occurred_at',
};

const INDEXES = `
  UQ_billing_feature_price_versions_effective IDX_billing_feature_price_versions_in_force
  UQ_billing_billing_accounts_provider_customer IDX_billing_billing_accounts_tax_id
  IDX_billing_subscriptions_issuing IDX_billing_subscriptions_reminders
  IDX_billing_subscriptions_status_past_due_since IDX_billing_subscriptions_trial_ends_at
  IDX_billing_subscriptions_cancel_at IDX_billing_subscriptions_suspended_at
  IDX_billing_subscription_items_subscription
  UQ_billing_charges_period UQ_billing_charges_open_recovery UQ_billing_charges_provider_charge
  IDX_billing_charges_history IDX_billing_charges_open IDX_billing_charges_creation_retry
  IDX_billing_charges_paid_recent IDX_billing_charges_cancel_pending
  IDX_billing_charge_lines_charge IDX_billing_provider_events_received_at
  IDX_billing_signup_registrations_google_sub UQ_billing_tenant_purge_jobs_in_flight
  IDX_billing_operator_audit_tenant_occurred
`
  .split(/\s+/)
  .filter(Boolean);

const CONSTRAINTS = `
  PK_billing_feature_prices UQ_billing_feature_prices_key CHK_billing_feature_prices_feature_key
  CHK_billing_feature_prices_cycle PK_billing_feature_price_versions
  FK_billing_feature_price_versions_price CHK_billing_feature_price_versions_amount
  PK_billing_billing_accounts UQ_billing_billing_accounts_tenant UQ_billing_billing_accounts_tenant_id
  CHK_billing_billing_accounts_tax_id_type CHK_billing_billing_accounts_provider
  CHK_billing_billing_accounts_auto_billing CHK_billing_billing_accounts_auto_billing_status
  PK_billing_subscriptions UQ_billing_subscriptions_tenant UQ_billing_subscriptions_tenant_id
  CHK_billing_subscriptions_status CHK_billing_subscriptions_suspension_reason_value
  CHK_billing_subscriptions_suspension_reason CHK_billing_subscriptions_cycle
  CHK_billing_subscriptions_anchor_day PK_billing_subscription_items
  FK_billing_subscription_items_subscription CHK_billing_subscription_items_feature_key
  EX_billing_subscription_items_window PK_billing_charges UQ_billing_charges_tenant_id
  FK_billing_charges_subscription CHK_billing_charges_kind CHK_billing_charges_period_dates
  CHK_billing_charges_status CHK_billing_charges_method CHK_billing_charges_provider
  CHK_billing_charges_provider_creation_status CHK_billing_charges_provider_ready
  PK_billing_charge_lines FK_billing_charge_lines_charge CHK_billing_charge_lines_feature_key
  PK_billing_provider_events CHK_billing_provider_events_provider PK_billing_signup_registrations
  UQ_billing_signup_registrations_tenant CHK_billing_signup_registrations_source
  CHK_billing_signup_registrations_status CHK_billing_signup_registrations_google_sub
  CHK_billing_signup_registrations_tax_id_type PK_billing_tenant_purge_jobs
  UQ_billing_tenant_purge_jobs_tenant_id CHK_billing_tenant_purge_jobs_reason
  CHK_billing_tenant_purge_jobs_status PK_billing_tenant_purge_steps
  FK_billing_tenant_purge_steps_job CHK_billing_tenant_purge_steps_participant
  PK_billing_provider_health CHK_billing_provider_health_webhook_status
  CHK_billing_provider_health_freeze PK_billing_operator_audit CHK_billing_operator_audit_action
`
  .split(/\s+/)
  .filter(Boolean);

// Tables whose tenant_id must be NOT NULL (all but the documented exemptions).
const TENANT_SCOPED = [
  'billing_accounts',
  'subscriptions',
  'subscription_items',
  'charges',
  'charge_lines',
  'provider_events',
  'tenant_purge_jobs',
  'tenant_purge_steps',
  'operator_audit',
];

describe('CreateBillingSchema migration (integration)', () => {
  let ds: DataSource;
  // One subscription per tenant (UQ_billing_subscriptions_tenant): every test gets fresh tenants.
  let tenantA = uuidv7();
  let tenantB = uuidv7();
  const usedTenants: string[] = [];

  const rows = <T>(sql: string, params: unknown[] = []) => ds.query<T[]>(sql, params);
  const rejects = async (sql: string, constraint: string, params: unknown[] = []) => {
    await expect(ds.query(sql, params)).rejects.toThrow(constraint);
  };

  async function insertSubscription(
    tenantId: string,
    overrides: { status?: string; reason?: string | null; anchorDay?: number; cycle?: string } = {},
  ): Promise<string> {
    const id = uuidv7();
    await ds.query(
      `INSERT INTO billing.subscriptions
         (id, tenant_id, status, suspension_reason, country_code, currency, timezone,
          merchant_profile_key, cycle, anchor_day)
       VALUES ($1, $2, $3, $4, 'BR', 'BRL', 'America/Sao_Paulo', 'BRL_FAKE', $5, $6)`,
      [
        id,
        tenantId,
        overrides.status ?? 'ACTIVE',
        overrides.reason ?? null,
        overrides.cycle ?? 'MONTHLY',
        overrides.anchorDay ?? 10,
      ],
    );
    return id;
  }

  async function insertCharge(
    tenantId: string,
    subscriptionId: string,
    o: {
      kind?: string;
      status?: string;
      periodStart?: string | null;
      periodEnd?: string | null;
      providerChargeId?: string | null;
      creationStatus?: string;
      method?: string | null;
      provider?: string | null;
    } = {},
  ): Promise<string> {
    const id = uuidv7();
    const kind = o.kind ?? 'PERIOD';
    const periodDefault = kind === 'PERIOD' ? '2030-01-01' : null;
    await ds.query(
      `INSERT INTO billing.charges
         (id, tenant_id, subscription_id, kind, period_start, period_end, due_date, subtotal_minor,
          amount_minor, currency, merchant_profile_key, status, provider_charge_id,
          provider_creation_status, method, provider)
       VALUES ($1,$2,$3,$4,$5,$6,'2030-01-05',1000,1000,'BRL','BRL_FAKE',$7,$8,$9,$10,$11)`,
      [
        id,
        tenantId,
        subscriptionId,
        kind,
        o.periodStart === undefined ? periodDefault : o.periodStart,
        o.periodEnd === undefined ? (kind === 'PERIOD' ? '2030-01-31' : null) : o.periodEnd,
        o.status ?? 'PENDING',
        o.providerChargeId ?? null,
        o.creationStatus ?? 'PENDING',
        o.method ?? null,
        o.provider ?? null,
      ],
    );
    return id;
  }

  beforeAll(async () => {
    ds = await createTestDataSource();
  });

  beforeEach(() => {
    tenantA = uuidv7();
    tenantB = uuidv7();
    usedTenants.push(tenantA, tenantB);
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM billing.charge_lines WHERE tenant_id = ANY($1::uuid[])`, [
      usedTenants,
    ]);
    await ds.query(`DELETE FROM billing.charges WHERE tenant_id = ANY($1::uuid[])`, [usedTenants]);
    await ds.query(`DELETE FROM billing.subscription_items WHERE tenant_id = ANY($1::uuid[])`, [
      usedTenants,
    ]);
    await ds.query(`DELETE FROM billing.subscriptions WHERE tenant_id = ANY($1::uuid[])`, [
      usedTenants,
    ]);
    await ds.destroy();
  });

  describe('schema shape', () => {
    it('creates every billing table with exactly the documented columns', async () => {
      const found = await rows<{ table_name: string; columns: string[] }>(
        `SELECT table_name, array_agg(column_name::text ORDER BY column_name) AS columns
           FROM information_schema.columns WHERE table_schema = 'billing' GROUP BY table_name`,
      );
      const actual = Object.fromEntries(found.map((r) => [r.table_name, r.columns]));
      const expected = Object.fromEntries(
        Object.entries(COLUMNS).map(([table, cols]) => [table, cols.split(' ').sort()]),
      );
      expect(actual).toEqual(expected);
    });

    it('creates every named index', async () => {
      const found = await rows<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes WHERE schemaname = 'billing'`,
      );
      expect(found.map((r) => r.indexname)).toEqual(expect.arrayContaining(INDEXES));
    });

    it('creates every named constraint', async () => {
      const found = await rows<{ conname: string }>(
        `SELECT c.conname FROM pg_constraint c
           JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'billing'`,
      );
      expect(found.map((r) => r.conname)).toEqual(expect.arrayContaining(CONSTRAINTS));
    });

    it('creates the standalone partial indexes with their documented predicates', async () => {
      const found = await rows<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'billing'`,
      );
      const def = (name: string) => found.find((r) => r.indexname === name)?.indexdef ?? '';
      expect(def('UQ_billing_charges_open_recovery')).toMatch(/UNIQUE INDEX/);
      expect(def('UQ_billing_charges_open_recovery')).toMatch(/RECOVERY/);
      expect(def('IDX_billing_charges_paid_recent')).toMatch(/\(paid_at\)/);
      expect(def('IDX_billing_charges_paid_recent')).toMatch(/PAID/);
      expect(def('IDX_billing_charges_cancel_pending')).toMatch(/provider_cancel_pending/);
      expect(def('IDX_billing_billing_accounts_tax_id')).toMatch(/\(tax_id\)/);
      expect(def('IDX_billing_billing_accounts_tax_id')).toMatch(/tax_id IS NOT NULL/);
    });
  });

  describe('tenant isolation', () => {
    it.each(TENANT_SCOPED)('%s.tenant_id is NOT NULL', async (table) => {
      const [row] = await rows<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = 'billing' AND table_name = $1 AND column_name = 'tenant_id'`,
        [table],
      );
      expect(row?.is_nullable).toBe('NO');
    });

    it.each(['feature_prices', 'feature_price_versions', 'provider_health'])(
      '%s is a documented tenant-id exemption (no tenant_id column)',
      async (table) => {
        const found = await rows(
          `SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'billing' AND table_name = $1 AND column_name = 'tenant_id'`,
          [table],
        );
        expect(found).toHaveLength(0);
      },
    );

    it('signup_registrations.tenant_id is NULLABLE until the registration completes', async () => {
      const [row] = await rows<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = 'billing' AND table_name = 'signup_registrations'
            AND column_name = 'tenant_id'`,
      );
      expect(row?.is_nullable).toBe('YES');
    });

    it('provider_events is keyed (provider, event_id), not by tenant', async () => {
      const [row] = await rows<{ cols: string[] }>(
        `SELECT array_agg(a.attname::text ORDER BY k.ord) AS cols
           FROM pg_constraint c
           JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
          WHERE c.conname = 'PK_billing_provider_events'`,
      );
      expect(row?.cols).toEqual(['provider', 'event_id']);
    });

    it('every tenant-scoped table with a tenant_id leads at least one index with it', async () => {
      const tables = [
        ...TENANT_SCOPED.filter((t) => t !== 'provider_events'),
        'signup_registrations',
      ];
      const found = await rows<{ tablename: string; indexdef: string }>(
        `SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'billing'`,
      );
      for (const table of tables) {
        const leads = found.some(
          (r) => r.tablename === table && /\(\s*"?tenant_id"?\s*[,)]/.test(r.indexdef),
        );
        expect(`${table}:${leads}`).toBe(`${table}:true`);
      }
    });

    it('rejects a charge that references another tenant’s subscription (composite FK)', async () => {
      const subscriptionId = await insertSubscription(tenantA);
      await rejects(
        `INSERT INTO billing.charges
           (id, tenant_id, subscription_id, kind, period_start, period_end, due_date,
            subtotal_minor, amount_minor, currency, merchant_profile_key, status)
         VALUES ($1, $2, $3, 'PERIOD', '2031-01-01', '2031-01-31', '2031-01-05',
                 1, 1, 'BRL', 'BRL_FAKE', 'PENDING')`,
        'FK_billing_charges_subscription',
        [uuidv7(), tenantB, subscriptionId],
      );
    });
  });

  describe('exclusion and partial unique indexes', () => {
    const insertItem = (
      tenantId: string,
      subscriptionId: string,
      feature: string,
      startsAt: string,
      endsAt: string | null,
    ) =>
      ds.query(
        `INSERT INTO billing.subscription_items
           (id, tenant_id, subscription_id, feature_key, starts_at, ends_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'SYSTEM')`,
        [uuidv7(), tenantId, subscriptionId, feature, startsAt, endsAt],
      );

    it('rejects overlapping subscription_items for one feature and accepts touching periods', async () => {
      const subscriptionId = await insertSubscription(tenantA);
      await insertItem(tenantA, subscriptionId, 'BOOKING', '2030-01-01', '2030-02-01');
      await expect(
        insertItem(tenantA, subscriptionId, 'BOOKING', '2030-01-15', null),
      ).rejects.toThrow('EX_billing_subscription_items_window');
      // The current row may end exactly when its replacement starts ([) ranges touch, not overlap).
      await insertItem(tenantA, subscriptionId, 'BOOKING', '2030-02-01', null);
      // A different feature on the same window is independent.
      await insertItem(tenantA, subscriptionId, 'LOYALTY', '2030-01-15', null);
    });

    it('rejects a second open recovery charge and ignores a cancelled one', async () => {
      const subscriptionId = await insertSubscription(tenantA);
      await insertCharge(tenantA, subscriptionId, { kind: 'RECOVERY', status: 'PENDING' });
      await expect(
        insertCharge(tenantA, subscriptionId, { kind: 'RECOVERY', status: 'OVERDUE' }),
      ).rejects.toThrow('UQ_billing_charges_open_recovery');
      await insertCharge(tenantA, subscriptionId, { kind: 'RECOVERY', status: 'CANCELED' });
      await insertCharge(tenantA, subscriptionId, { kind: 'RECOVERY', status: 'PAID' });
    });

    it('rejects a duplicate PERIOD charge for one period but lets a cancelled one be replaced', async () => {
      const subscriptionId = await insertSubscription(tenantA);
      await insertCharge(tenantA, subscriptionId, {
        periodStart: '2032-01-01',
        periodEnd: '2032-01-31',
      });
      await expect(
        insertCharge(tenantA, subscriptionId, {
          periodStart: '2032-01-01',
          periodEnd: '2032-01-31',
        }),
      ).rejects.toThrow('UQ_billing_charges_period');
      await insertCharge(tenantA, subscriptionId, {
        status: 'CANCELED',
        periodStart: '2032-02-01',
        periodEnd: '2032-02-28',
      });
      await insertCharge(tenantA, subscriptionId, {
        periodStart: '2032-02-01',
        periodEnd: '2032-02-28',
      });
    });

    it('rejects a duplicate provider charge id across tenants', async () => {
      const a = await insertSubscription(tenantA);
      const b = await insertSubscription(tenantB);
      const providerChargeId = `pay_${uuidv7()}`;
      await insertCharge(tenantA, a, {
        provider: 'ASAAS',
        providerChargeId,
        periodStart: '2033-01-01',
        periodEnd: '2033-01-31',
      });
      await expect(
        ds.query(
          `INSERT INTO billing.charges
             (id, tenant_id, subscription_id, kind, period_start, period_end, due_date,
              subtotal_minor, amount_minor, currency, merchant_profile_key, status,
              provider, provider_charge_id)
           VALUES ($1,$2,$3,'PERIOD','2033-01-01','2033-01-31','2033-01-05',1,1,'BRL','BRL_FAKE',
                   'PENDING','ASAAS',$4)`,
          [uuidv7(), tenantB, b, providerChargeId],
        ),
      ).rejects.toThrow('UQ_billing_charges_provider_charge');
    });
  });

  describe('CHECK constraints reject a bad row', () => {
    it('subscriptions: closed status, suspension reason value, reason iff SUSPENDED, cycle, anchor day', async () => {
      await expect(insertSubscription(tenantA, { status: 'BOGUS' })).rejects.toThrow(
        'CHK_billing_subscriptions_status',
      );
      await expect(
        insertSubscription(tenantA, { status: 'SUSPENDED', reason: 'BOGUS' }),
      ).rejects.toThrow('CHK_billing_subscriptions_suspension_reason_value');
      await expect(insertSubscription(tenantA, { status: 'SUSPENDED' })).rejects.toThrow(
        'CHK_billing_subscriptions_suspension_reason',
      );
      await expect(
        insertSubscription(tenantA, { status: 'ACTIVE', reason: 'OPERATOR' }),
      ).rejects.toThrow('CHK_billing_subscriptions_suspension_reason');
      await expect(insertSubscription(tenantA, { cycle: 'ANNUAL' })).rejects.toThrow(
        'CHK_billing_subscriptions_cycle',
      );
      await expect(insertSubscription(tenantA, { anchorDay: 0 })).rejects.toThrow(
        'CHK_billing_subscriptions_anchor_day',
      );
      await expect(insertSubscription(tenantA, { anchorDay: 29 })).rejects.toThrow(
        'CHK_billing_subscriptions_anchor_day',
      );
    });

    it('subscriptions: accepts a valid SUSPENDED row and every anchor-day bound', async () => {
      const t = uuidv7();
      await insertSubscription(t, { status: 'SUSPENDED', reason: 'NON_PAYMENT', anchorDay: 28 });
      await insertSubscription(uuidv7(), { anchorDay: 1 });
      await ds.query(`DELETE FROM billing.subscriptions WHERE tenant_id = $1`, [t]);
    });

    it('charges: closed kind, status, method, provider, creation status and READY needs a provider id', async () => {
      const subscriptionId = await insertSubscription(tenantA);
      await expect(insertCharge(tenantA, subscriptionId, { kind: 'ADDON' })).rejects.toThrow(
        'CHK_billing_charges_kind',
      );
      await expect(insertCharge(tenantA, subscriptionId, { status: 'BOGUS' })).rejects.toThrow(
        'CHK_billing_charges_status',
      );
      await expect(insertCharge(tenantA, subscriptionId, { method: 'CASH' })).rejects.toThrow(
        'CHK_billing_charges_method',
      );
      await expect(insertCharge(tenantA, subscriptionId, { provider: 'PAYPAL' })).rejects.toThrow(
        'CHK_billing_charges_provider',
      );
      await expect(
        insertCharge(tenantA, subscriptionId, { creationStatus: 'BOGUS' }),
      ).rejects.toThrow('CHK_billing_charges_provider_creation_status');
      await expect(
        insertCharge(tenantA, subscriptionId, { creationStatus: 'READY', providerChargeId: null }),
      ).rejects.toThrow('CHK_billing_charges_provider_ready');
      await insertCharge(tenantA, subscriptionId, {
        creationStatus: 'READY',
        providerChargeId: `pay_${uuidv7()}`,
        periodStart: '2034-01-01',
        periodEnd: '2034-01-31',
      });
    });

    it('charges: PERIOD needs period dates and RECOVERY must have none', async () => {
      const subscriptionId = await insertSubscription(tenantA);
      await expect(
        insertCharge(tenantA, subscriptionId, {
          kind: 'PERIOD',
          periodStart: null,
          periodEnd: null,
        }),
      ).rejects.toThrow('CHK_billing_charges_period_dates');
      await expect(
        insertCharge(tenantA, subscriptionId, {
          kind: 'RECOVERY',
          periodStart: '2035-01-01',
          periodEnd: '2035-01-31',
        }),
      ).rejects.toThrow('CHK_billing_charges_period_dates');
    });

    it('feature_prices / feature_price_versions: feature key, cycle and non-negative amount', async () => {
      const insertPrice = (feature: string, cycle: string) =>
        ds.query(
          `INSERT INTO billing.feature_prices (id, feature_key, country_code, tier, cycle, currency)
           VALUES ($1, $2, 'ZZ', 'STANDARD', $3, 'BRL')`,
          [uuidv7(), feature, cycle],
        );
      await expect(insertPrice('BOGUS', 'MONTHLY')).rejects.toThrow(
        'CHK_billing_feature_prices_feature_key',
      );
      await expect(insertPrice('HOTSITE', 'ANNUAL')).rejects.toThrow(
        'CHK_billing_feature_prices_cycle',
      );
      const priceId = uuidv7();
      await ds.query(
        `INSERT INTO billing.feature_prices (id, feature_key, country_code, currency)
         VALUES ($1, 'HOTSITE', 'ZZ', 'BRL')`,
        [priceId],
      );
      try {
        await expect(
          ds.query(
            `INSERT INTO billing.feature_price_versions
               (id, feature_price_id, amount_minor, effective_from, created_by, reason)
             VALUES ($1, $2, -1, '2030-01-01', 'SYSTEM', 'test')`,
            [uuidv7(), priceId],
          ),
        ).rejects.toThrow('CHK_billing_feature_price_versions_amount');
      } finally {
        await ds.query(`DELETE FROM billing.feature_prices WHERE id = $1`, [priceId]);
      }
    });

    it('subscription_items and charge_lines: closed feature key', async () => {
      const subscriptionId = await insertSubscription(tenantA);
      await rejects(
        `INSERT INTO billing.subscription_items
           (id, tenant_id, subscription_id, feature_key, starts_at, created_by)
         VALUES ($1, $2, $3, 'BOGUS', now(), 'SYSTEM')`,
        'CHK_billing_subscription_items_feature_key',
        [uuidv7(), tenantA, subscriptionId],
      );
      const chargeId = await insertCharge(tenantA, subscriptionId, {
        periodStart: '2036-01-01',
        periodEnd: '2036-01-31',
      });
      await rejects(
        `INSERT INTO billing.charge_lines (id, tenant_id, charge_id, feature_key, tier, unit_price_minor)
         VALUES ($1, $2, $3, 'BOGUS', 'STANDARD', 1)`,
        'CHK_billing_charge_lines_feature_key',
        [uuidv7(), tenantA, chargeId],
      );
    });

    it('billing_accounts: closed provider, tax id type and auto-billing sets', async () => {
      const insertAccount = (col: string, value: string) =>
        ds.query(
          `INSERT INTO billing.billing_accounts (id, tenant_id, ${col}) VALUES ($1, $2, $3)`,
          [uuidv7(), uuidv7(), value],
        );
      await expect(insertAccount('provider', 'PAYPAL')).rejects.toThrow(
        'CHK_billing_billing_accounts_provider',
      );
      await expect(insertAccount('tax_id_type', 'SSN')).rejects.toThrow(
        'CHK_billing_billing_accounts_tax_id_type',
      );
      await expect(insertAccount('auto_billing', 'BOGUS')).rejects.toThrow(
        'CHK_billing_billing_accounts_auto_billing',
      );
      await expect(insertAccount('auto_billing_status', 'BOGUS')).rejects.toThrow(
        'CHK_billing_billing_accounts_auto_billing_status',
      );
    });

    it('provider_events: closed provider', async () => {
      await rejects(
        `INSERT INTO billing.provider_events (provider, event_id, tenant_id, event_type, received_at, processed_at)
         VALUES ('PAYPAL', 'e1', $1, 't', now(), now())`,
        'CHK_billing_provider_events_provider',
        [uuidv7()],
      );
    });

    it('signup_registrations: closed source/status/tax id type and google_sub for SELF_SIGNUP', async () => {
      const insertReg = (
        source: string,
        status: string,
        googleSub: string | null,
        taxIdType: string | null,
      ) =>
        ds.query(
          `INSERT INTO billing.signup_registrations (id, source, status, google_sub, tax_id_type)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv7(), source, status, googleSub, taxIdType],
        );
      await expect(insertReg('BOGUS', 'RESERVED', 'sub', null)).rejects.toThrow(
        'CHK_billing_signup_registrations_source',
      );
      await expect(insertReg('OPERATOR', 'BOGUS', null, null)).rejects.toThrow(
        'CHK_billing_signup_registrations_status',
      );
      await expect(insertReg('SELF_SIGNUP', 'RESERVED', null, null)).rejects.toThrow(
        'CHK_billing_signup_registrations_google_sub',
      );
      await expect(insertReg('OPERATOR', 'RESERVED', null, 'SSN')).rejects.toThrow(
        'CHK_billing_signup_registrations_tax_id_type',
      );
      const operatorId = uuidv7();
      await ds.query(
        `INSERT INTO billing.signup_registrations (id, source, status) VALUES ($1, 'OPERATOR', 'RESERVED')`,
        [operatorId],
      );
      await ds.query(`DELETE FROM billing.signup_registrations WHERE id = $1`, [operatorId]);
    });

    it('tenant_purge_jobs / tenant_purge_steps: closed sets and one in-flight job per tenant', async () => {
      const tenantId = uuidv7();
      const insertJob = (reason: string, status: string, id = uuidv7()) =>
        ds.query(
          `INSERT INTO billing.tenant_purge_jobs (id, tenant_id, reason, status, requested_at)
           VALUES ($1, $2, $3, $4, now())`,
          [id, tenantId, reason, status],
        );
      await expect(insertJob('BOGUS', 'REQUESTED')).rejects.toThrow(
        'CHK_billing_tenant_purge_jobs_reason',
      );
      await expect(insertJob('SUSPENSION_AGE', 'BOGUS')).rejects.toThrow(
        'CHK_billing_tenant_purge_jobs_status',
      );
      const jobId = uuidv7();
      await insertJob('SUSPENSION_AGE', 'REQUESTED', jobId);
      try {
        await expect(insertJob('OPERATOR_REQUEST', 'IN_PROGRESS')).rejects.toThrow(
          'UQ_billing_tenant_purge_jobs_in_flight',
        );
        await insertJob('OPERATOR_REQUEST', 'COMPLETED');
        await expect(
          ds.query(
            `INSERT INTO billing.tenant_purge_steps (tenant_id, job_id, participant, completed_at)
             VALUES ($1, $2, 'BOGUS', now())`,
            [tenantId, jobId],
          ),
        ).rejects.toThrow('CHK_billing_tenant_purge_steps_participant');
        await expect(
          ds.query(
            `INSERT INTO billing.tenant_purge_steps (tenant_id, job_id, participant, completed_at)
             VALUES ($1, $2, 'BILLING', now())`,
            [uuidv7(), jobId],
          ),
        ).rejects.toThrow('FK_billing_tenant_purge_steps_job');
      } finally {
        await ds.query(`DELETE FROM billing.tenant_purge_steps WHERE tenant_id = $1`, [tenantId]);
        await ds.query(`DELETE FROM billing.tenant_purge_jobs WHERE tenant_id = $1`, [tenantId]);
      }
    });

    it('provider_health: closed webhook status and freeze_active = (freeze_since IS NOT NULL)', async () => {
      const key = `TEST_${uuidv7()}`.slice(0, 40);
      await rejects(
        `INSERT INTO billing.provider_health (merchant_profile_key, webhook_status) VALUES ($1, 'BOGUS')`,
        'CHK_billing_provider_health_webhook_status',
        [key],
      );
      await rejects(
        `INSERT INTO billing.provider_health (merchant_profile_key, freeze_active) VALUES ($1, true)`,
        'CHK_billing_provider_health_freeze',
        [key],
      );
      await rejects(
        `INSERT INTO billing.provider_health (merchant_profile_key, freeze_active, freeze_since)
         VALUES ($1, false, now())`,
        'CHK_billing_provider_health_freeze',
        [key],
      );
    });

    it('operator_audit: closed action set', async () => {
      await rejects(
        `INSERT INTO billing.operator_audit (id, tenant_id, actor, action, payload, occurred_at)
         VALUES ($1, $2, 'op', 'BOGUS', '{}', now())`,
        'CHK_billing_operator_audit_action',
        [uuidv7(), uuidv7()],
      );
    });
  });

  describe('application role grants', () => {
    it('lets the ikaro role use the schema and read/write every existing table', async () => {
      const [schema] = await rows<{ usage: boolean }>(
        `SELECT has_schema_privilege('ikaro', 'billing', 'USAGE') AS usage`,
      );
      expect(schema?.usage).toBe(true);
      const tables = await rows<{ table_name: string; ok: boolean }>(
        `SELECT table_name,
                has_table_privilege('ikaro', format('billing.%I', table_name), 'SELECT,INSERT,UPDATE,DELETE') AS ok
           FROM information_schema.tables WHERE table_schema = 'billing'`,
      );
      expect(tables).toHaveLength(Object.keys(COLUMNS).length);
      expect(tables.filter((t) => !t.ok)).toEqual([]);
    });

    it('applies default privileges to a table created later in the schema', async () => {
      await ds.query(`CREATE TABLE billing.zz_grant_probe (id int)`);
      try {
        const [row] = await rows<{ ok: boolean }>(
          `SELECT has_table_privilege('ikaro', 'billing.zz_grant_probe', 'SELECT,INSERT,UPDATE,DELETE') AS ok`,
        );
        expect(row?.ok).toBe(true);
      } finally {
        await ds.query(`DROP TABLE billing.zz_grant_probe`);
      }
    });

    it('is a no-op, not an error, when the application role does not exist yet', async () => {
      await expect(
        ds.query(appRoleGrantSql('billing', 'ikaro_absent_role')),
      ).resolves.toBeDefined();
      const [row] = await rows<{ exists: boolean }>(
        `SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ikaro_absent_role') AS exists`,
      );
      expect(row?.exists).toBe(false);
    });
  });

  describe('down() / up() round trip', () => {
    // Last on purpose: it drops and recreates the schema, so earlier rows are gone afterwards.
    it('drops the schema on down(), keeps btree_gist, and up() recreates it', async () => {
      const queryRunner = ds.createQueryRunner();
      try {
        await new CreateBillingSchema1748500000039().down(queryRunner);
        const [gone] = await rows<{ count: string }>(
          `SELECT count(*)::text AS count FROM pg_namespace WHERE nspname = 'billing'`,
        );
        expect(gone?.count).toBe('0');
        const [ext] = await rows<{ count: string }>(
          `SELECT count(*)::text AS count FROM pg_extension WHERE extname = 'btree_gist'`,
        );
        expect(ext?.count).toBe('1');

        await new CreateBillingSchema1748500000039().up(queryRunner);
        const tables = await rows<{ count: string }>(
          `SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'billing'`,
        );
        expect(Number(tables[0]?.count)).toBe(Object.keys(COLUMNS).length);
      } finally {
        await queryRunner.release();
      }
    });
  });
});
