import { MigrationInterface, QueryRunner } from 'typeorm';
import { appRoleGrantSql } from '../billing-schema-grants';

// Billing first schema (M25-S03) — docs/DATABASE_SCHEMA.md § Schema: `billing`. Expand only: a new
// schema, no existing table touched, BR-only (slice E/F2/H columns and charge_tax_lines arrive
// later by their own expand migrations). Constraint names follow docs/DATABASE_SCHEMA.md §
// Billing constraint naming and closed-value CHECKs.
const FEATURE_KEYS = `'HOTSITE','BOOKING','LOYALTY','CHATBOT','LEAD_FORM'`;
const PROVIDERS = `'ASAAS','STRIPE'`;
const TAX_ID_TYPES = `'CNPJ','CPF','OTHER'`;

export class CreateBillingSchema1748500000039 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SCHEMA IF NOT EXISTS "billing"');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    // Grants first: default privileges only cover tables created after they are set.
    await queryRunner.query(appRoleGrantSql('billing', 'ikaro'));

    await queryRunner.query(`
      CREATE TABLE "billing"."feature_prices" (
        "id"           UUID         NOT NULL,
        "feature_key"  VARCHAR(20)  NOT NULL,
        "country_code" CHAR(2)      NOT NULL,
        "tier"         VARCHAR(20)  NOT NULL DEFAULT 'STANDARD',
        "cycle"        VARCHAR(10)  NOT NULL DEFAULT 'MONTHLY',
        "currency"     CHAR(3)      NOT NULL,
        "selectable"   BOOLEAN      NOT NULL DEFAULT true,
        "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_billing_feature_prices" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_billing_feature_prices_key" UNIQUE ("feature_key", "country_code", "tier", "cycle"),
        CONSTRAINT "CHK_billing_feature_prices_feature_key" CHECK ("feature_key" IN (${FEATURE_KEYS})),
        CONSTRAINT "CHK_billing_feature_prices_cycle" CHECK ("cycle" = 'MONTHLY')
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "billing"."feature_price_versions" (
        "id"               UUID         NOT NULL,
        "feature_price_id" UUID         NOT NULL,
        "amount_minor"     BIGINT       NOT NULL,
        "effective_from"   DATE         NOT NULL,
        "announced_at"     TIMESTAMPTZ,
        "created_by"       VARCHAR(100) NOT NULL,
        "reason"           TEXT         NOT NULL,
        "superseded_at"    TIMESTAMPTZ,
        "batch_id"         UUID,
        "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_billing_feature_price_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_billing_feature_price_versions_price"
          FOREIGN KEY ("feature_price_id") REFERENCES "billing"."feature_prices" ("id"),
        CONSTRAINT "CHK_billing_feature_price_versions_amount" CHECK ("amount_minor" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_billing_feature_price_versions_effective"
        ON "billing"."feature_price_versions" ("feature_price_id", "effective_from")
        WHERE "superseded_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_feature_price_versions_in_force"
        ON "billing"."feature_price_versions" ("feature_price_id", "effective_from" DESC)
        WHERE "superseded_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "billing"."billing_accounts" (
        "id"                   UUID         NOT NULL,
        "tenant_id"            UUID         NOT NULL,
        "tax_id_type"          VARCHAR(10),
        "tax_id"               VARCHAR(32),
        "legal_name"           VARCHAR(255),
        "billing_email"        VARCHAR(255),
        "address"              JSONB,
        "provider"             VARCHAR(10),
        "provider_customer_id" VARCHAR(100),
        "auto_billing"         VARCHAR(20)  NOT NULL DEFAULT 'NONE',
        "auto_billing_status"  VARCHAR(25)  NOT NULL DEFAULT 'INACTIVE',
        "auto_billing_label"   VARCHAR(100),
        "terms_version"        VARCHAR(20),
        "terms_accepted_at"    TIMESTAMPTZ,
        "terms_accepted_by"    VARCHAR(255),
        "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_billing_billing_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_billing_billing_accounts_tenant" UNIQUE ("tenant_id"),
        CONSTRAINT "UQ_billing_billing_accounts_tenant_id" UNIQUE ("tenant_id", "id"),
        CONSTRAINT "CHK_billing_billing_accounts_tax_id_type"
          CHECK ("tax_id_type" IS NULL OR "tax_id_type" IN (${TAX_ID_TYPES})),
        CONSTRAINT "CHK_billing_billing_accounts_provider"
          CHECK ("provider" IS NULL OR "provider" IN (${PROVIDERS})),
        CONSTRAINT "CHK_billing_billing_accounts_auto_billing"
          CHECK ("auto_billing" IN ('NONE','PIX_AUTOMATICO','CARD_RECURRING')),
        CONSTRAINT "CHK_billing_billing_accounts_auto_billing_status"
          CHECK ("auto_billing_status" IN ('INACTIVE','PENDING_AUTHORIZATION','ACTIVE'))
      )
    `);
    // Standalone: the webhook resolves the tenant from the provider customer id before any tenant
    // context exists.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_billing_billing_accounts_provider_customer"
        ON "billing"."billing_accounts" ("provider", "provider_customer_id")
        WHERE "provider_customer_id" IS NOT NULL
    `);
    // Standalone: the trial-farming lookup (UC-127 A3) runs before any tenant context exists.
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_billing_accounts_tax_id"
        ON "billing"."billing_accounts" ("tax_id")
        WHERE "tax_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "billing"."subscriptions" (
        "id"                       UUID         NOT NULL,
        "tenant_id"                UUID         NOT NULL,
        "status"                   VARCHAR(12)  NOT NULL,
        "suspension_reason"        VARCHAR(20),
        "country_code"             CHAR(2)      NOT NULL,
        "currency"                 CHAR(3)      NOT NULL,
        "timezone"                 VARCHAR(64)  NOT NULL,
        "merchant_profile_key"     VARCHAR(40)  NOT NULL,
        "cycle"                    VARCHAR(10)  NOT NULL DEFAULT 'MONTHLY',
        "anchor_day"               SMALLINT     NOT NULL,
        "trial_ends_at"            TIMESTAMPTZ,
        "current_period_start"     TIMESTAMPTZ,
        "current_period_end"       TIMESTAMPTZ,
        "next_due_date"            DATE,
        "past_due_since"           TIMESTAMPTZ,
        "grace_until"              TIMESTAMPTZ,
        "cancel_at"                TIMESTAMPTZ,
        "plan_confirmed_at"        TIMESTAMPTZ,
        "suspended_at"             TIMESTAMPTZ,
        "purge_warning_30_sent_at" TIMESTAMPTZ,
        "purge_warning_7_sent_at"  TIMESTAMPTZ,
        "has_ever_paid"            BOOLEAN      NOT NULL DEFAULT false,
        "exempt"                   BOOLEAN      NOT NULL DEFAULT false,
        "version"                  INT          NOT NULL DEFAULT 0,
        "created_at"               TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"               TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_billing_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_billing_subscriptions_tenant" UNIQUE ("tenant_id"),
        CONSTRAINT "UQ_billing_subscriptions_tenant_id" UNIQUE ("tenant_id", "id"),
        CONSTRAINT "CHK_billing_subscriptions_status"
          CHECK ("status" IN ('TRIALING','ACTIVE','PAST_DUE','SUSPENDED')),
        CONSTRAINT "CHK_billing_subscriptions_suspension_reason_value"
          CHECK ("suspension_reason" IS NULL
            OR "suspension_reason" IN ('NON_PAYMENT','CANCELED','PAYMENT_REVERSED','OPERATOR')),
        CONSTRAINT "CHK_billing_subscriptions_suspension_reason"
          CHECK (("suspension_reason" IS NOT NULL) = ("status" = 'SUSPENDED')),
        CONSTRAINT "CHK_billing_subscriptions_cycle" CHECK ("cycle" = 'MONTHLY'),
        CONSTRAINT "CHK_billing_subscriptions_anchor_day" CHECK ("anchor_day" BETWEEN 1 AND 28)
      )
    `);
    // Standalone partial indexes: the cross-tenant jobs cannot seek a tenant_id-leading index.
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_subscriptions_issuing"
        ON "billing"."subscriptions" ("next_due_date")
        WHERE "status" IN ('TRIALING','ACTIVE') AND NOT "exempt"
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_subscriptions_reminders"
        ON "billing"."subscriptions" ("next_due_date")
        WHERE "status" IN ('TRIALING','ACTIVE','PAST_DUE') AND NOT "exempt"
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_subscriptions_status_past_due_since"
        ON "billing"."subscriptions" ("status", "past_due_since")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_subscriptions_trial_ends_at"
        ON "billing"."subscriptions" ("trial_ends_at")
        WHERE "status" = 'TRIALING'
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_subscriptions_cancel_at"
        ON "billing"."subscriptions" ("cancel_at")
        WHERE "cancel_at" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_subscriptions_suspended_at"
        ON "billing"."subscriptions" ("suspended_at")
        WHERE "status" = 'SUSPENDED'
    `);

    await queryRunner.query(`
      CREATE TABLE "billing"."subscription_items" (
        "id"              UUID         NOT NULL,
        "tenant_id"       UUID         NOT NULL,
        "subscription_id" UUID         NOT NULL,
        "feature_key"     VARCHAR(20)  NOT NULL,
        "tier"            VARCHAR(20)  NOT NULL DEFAULT 'STANDARD',
        "starts_at"       TIMESTAMPTZ  NOT NULL,
        "ends_at"         TIMESTAMPTZ,
        "created_by"      VARCHAR(100) NOT NULL,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_billing_subscription_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_billing_subscription_items_subscription"
          FOREIGN KEY ("tenant_id", "subscription_id")
          REFERENCES "billing"."subscriptions" ("tenant_id", "id"),
        CONSTRAINT "CHK_billing_subscription_items_feature_key" CHECK ("feature_key" IN (${FEATURE_KEYS})),
        CONSTRAINT "EX_billing_subscription_items_window" EXCLUDE USING gist (
          "tenant_id" WITH =,
          "subscription_id" WITH =,
          "feature_key" WITH =,
          tstzrange("starts_at", COALESCE("ends_at", 'infinity'::timestamptz), '[)') WITH &&
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_subscription_items_subscription"
        ON "billing"."subscription_items" ("tenant_id", "subscription_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "billing"."charges" (
        "id"                                   UUID         NOT NULL,
        "tenant_id"                            UUID         NOT NULL,
        "subscription_id"                      UUID         NOT NULL,
        "kind"                                 VARCHAR(10)  NOT NULL DEFAULT 'PERIOD',
        "period_start"                         DATE,
        "period_end"                           DATE,
        "due_date"                             DATE         NOT NULL,
        "subtotal_minor"                       BIGINT       NOT NULL,
        "amount_minor"                         BIGINT       NOT NULL,
        "currency"                             CHAR(3)      NOT NULL,
        "merchant_profile_key"                 VARCHAR(40)  NOT NULL,
        "status"                               VARCHAR(12)  NOT NULL,
        "method"                               VARCHAR(10),
        "paid_at"                              TIMESTAMPTZ,
        "provider"                             VARCHAR(10),
        "provider_charge_id"                   VARCHAR(100),
        "payment_url"                          TEXT,
        "payment_url_expires_at"               TIMESTAMPTZ,
        "receipt_url"                          TEXT,
        "payment_return_seen_at"               TIMESTAMPTZ,
        "refunded_amount_minor"                BIGINT       NOT NULL DEFAULT 0,
        "provider_creation_status"             VARCHAR(10)  NOT NULL DEFAULT 'PENDING',
        "provider_creation_attempts"           INT          NOT NULL DEFAULT 0,
        "provider_creation_last_attempt_at"    TIMESTAMPTZ,
        "provider_cancel_pending"              BOOLEAN      NOT NULL DEFAULT false,
        "created_at"                           TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"                           TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_billing_charges" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_billing_charges_tenant_id" UNIQUE ("tenant_id", "id"),
        CONSTRAINT "FK_billing_charges_subscription"
          FOREIGN KEY ("tenant_id", "subscription_id")
          REFERENCES "billing"."subscriptions" ("tenant_id", "id"),
        CONSTRAINT "CHK_billing_charges_kind" CHECK ("kind" IN ('PERIOD','RECOVERY')),
        CONSTRAINT "CHK_billing_charges_period_dates" CHECK (
          ("kind" = 'PERIOD' AND "period_start" IS NOT NULL AND "period_end" IS NOT NULL)
          OR ("kind" = 'RECOVERY' AND "period_start" IS NULL AND "period_end" IS NULL)
        ),
        CONSTRAINT "CHK_billing_charges_status" CHECK (
          "status" IN ('PENDING','PAID','OVERDUE','FAILED','CANCELED','REFUNDED','CHARGEBACK')
        ),
        CONSTRAINT "CHK_billing_charges_method"
          CHECK ("method" IS NULL OR "method" IN ('CARD','PIX','BOLETO')),
        CONSTRAINT "CHK_billing_charges_provider"
          CHECK ("provider" IS NULL OR "provider" IN (${PROVIDERS})),
        CONSTRAINT "CHK_billing_charges_provider_creation_status"
          CHECK ("provider_creation_status" IN ('PENDING','READY','FAILED')),
        CONSTRAINT "CHK_billing_charges_provider_ready"
          CHECK ("provider_creation_status" <> 'READY' OR "provider_charge_id" IS NOT NULL)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_billing_charges_period"
        ON "billing"."charges" ("tenant_id", "subscription_id", "period_start")
        WHERE "kind" = 'PERIOD' AND "status" <> 'CANCELED'
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_billing_charges_open_recovery"
        ON "billing"."charges" ("tenant_id", "subscription_id")
        WHERE "kind" = 'RECOVERY' AND "status" IN ('PENDING','OVERDUE')
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_billing_charges_provider_charge"
        ON "billing"."charges" ("provider", "provider_charge_id")
        WHERE "provider_charge_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_charges_history"
        ON "billing"."charges" ("tenant_id", "due_date" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_charges_open"
        ON "billing"."charges" ("status", "due_date")
        WHERE "status" IN ('PENDING','OVERDUE')
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_charges_creation_retry"
        ON "billing"."charges" ("provider_creation_status", "provider_creation_last_attempt_at")
        WHERE "provider_charge_id" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_charges_paid_recent"
        ON "billing"."charges" ("paid_at")
        WHERE "status" = 'PAID'
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_charges_cancel_pending"
        ON "billing"."charges" ("status", "due_date")
        WHERE "provider_cancel_pending"
    `);

    await queryRunner.query(`
      CREATE TABLE "billing"."charge_lines" (
        "id"               UUID        NOT NULL,
        "tenant_id"        UUID        NOT NULL,
        "charge_id"        UUID        NOT NULL,
        "feature_key"      VARCHAR(20) NOT NULL,
        "tier"             VARCHAR(20) NOT NULL,
        "unit_price_minor" BIGINT      NOT NULL,
        CONSTRAINT "PK_billing_charge_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_billing_charge_lines_charge"
          FOREIGN KEY ("tenant_id", "charge_id")
          REFERENCES "billing"."charges" ("tenant_id", "id"),
        CONSTRAINT "CHK_billing_charge_lines_feature_key" CHECK ("feature_key" IN (${FEATURE_KEYS}))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_charge_lines_charge"
        ON "billing"."charge_lines" ("tenant_id", "charge_id")
    `);

    // Webhook idempotency inbox: keyed (provider, event_id) because the webhook must dedupe before
    // any tenant context exists (documented tenant-first exemption).
    await queryRunner.query(`
      CREATE TABLE "billing"."provider_events" (
        "provider"     VARCHAR(10)  NOT NULL,
        "event_id"     VARCHAR(100) NOT NULL,
        "tenant_id"    UUID         NOT NULL,
        "event_type"   VARCHAR(60)  NOT NULL,
        "received_at"  TIMESTAMPTZ  NOT NULL,
        "processed_at" TIMESTAMPTZ  NOT NULL,
        CONSTRAINT "PK_billing_provider_events" PRIMARY KEY ("provider", "event_id"),
        CONSTRAINT "CHK_billing_provider_events_provider" CHECK ("provider" IN (${PROVIDERS}))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_provider_events_received_at"
        ON "billing"."provider_events" ("received_at")
    `);

    // tenant_id is NULL until the registration completes (the row exists before the tenant).
    await queryRunner.query(`
      CREATE TABLE "billing"."signup_registrations" (
        "id"                UUID         NOT NULL,
        "tenant_id"         UUID,
        "source"            VARCHAR(12)  NOT NULL,
        "status"            VARCHAR(10)  NOT NULL,
        "google_sub"        VARCHAR(100),
        "tax_id_type"       VARCHAR(10),
        "tax_id"            VARCHAR(32),
        "terms_version"     VARCHAR(20),
        "terms_accepted_at" TIMESTAMPTZ,
        "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_billing_signup_registrations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_billing_signup_registrations_tenant" UNIQUE ("tenant_id"),
        CONSTRAINT "CHK_billing_signup_registrations_source"
          CHECK ("source" IN ('SELF_SIGNUP','OPERATOR')),
        CONSTRAINT "CHK_billing_signup_registrations_status"
          CHECK ("status" IN ('RESERVED','COMPLETED')),
        CONSTRAINT "CHK_billing_signup_registrations_google_sub"
          CHECK ("source" <> 'SELF_SIGNUP' OR "google_sub" IS NOT NULL),
        CONSTRAINT "CHK_billing_signup_registrations_tax_id_type"
          CHECK ("tax_id_type" IS NULL OR "tax_id_type" IN (${TAX_ID_TYPES})),
        CONSTRAINT "CHK_billing_signup_registrations_terms"
          CHECK ("source" <> 'SELF_SIGNUP'
            OR ("terms_version" IS NOT NULL AND "terms_accepted_at" IS NOT NULL))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_signup_registrations_google_sub"
        ON "billing"."signup_registrations" ("google_sub")
    `);

    await queryRunner.query(`
      CREATE TABLE "billing"."tenant_purge_jobs" (
        "id"           UUID         NOT NULL,
        "tenant_id"    UUID         NOT NULL,
        "reason"       VARCHAR(32)  NOT NULL,
        "status"       VARCHAR(16)  NOT NULL DEFAULT 'REQUESTED',
        "requested_at" TIMESTAMPTZ  NOT NULL,
        "completed_at" TIMESTAMPTZ,
        "last_error"   TEXT,
        "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_billing_tenant_purge_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_billing_tenant_purge_jobs_tenant_id" UNIQUE ("tenant_id", "id"),
        CONSTRAINT "CHK_billing_tenant_purge_jobs_reason"
          CHECK ("reason" IN ('SUSPENSION_AGE','SELF_SERVICE_DISCARD','OPERATOR_REQUEST')),
        CONSTRAINT "CHK_billing_tenant_purge_jobs_status"
          CHECK ("status" IN ('REQUESTED','IN_PROGRESS','FAILED','COMPLETED'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_billing_tenant_purge_jobs_in_flight"
        ON "billing"."tenant_purge_jobs" ("tenant_id")
        WHERE "status" <> 'COMPLETED'
    `);
    await queryRunner.query(`
      CREATE TABLE "billing"."tenant_purge_steps" (
        "tenant_id"    UUID        NOT NULL,
        "job_id"       UUID        NOT NULL,
        "participant"  VARCHAR(16) NOT NULL,
        "completed_at" TIMESTAMPTZ NOT NULL,
        "metadata"     JSONB,
        CONSTRAINT "PK_billing_tenant_purge_steps" PRIMARY KEY ("tenant_id", "job_id", "participant"),
        CONSTRAINT "FK_billing_tenant_purge_steps_job"
          FOREIGN KEY ("tenant_id", "job_id")
          REFERENCES "billing"."tenant_purge_jobs" ("tenant_id", "id"),
        CONSTRAINT "CHK_billing_tenant_purge_steps_participant" CHECK ("participant" IN (
          'BOOKING','CUSTOMER','STAFF','LOYALTY','NOTIFICATION','PLATFORM','BILLING','STORAGE','PROVIDER'
        ))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "billing"."provider_health" (
        "merchant_profile_key"   VARCHAR(40) NOT NULL,
        "last_reconcile_ok_at"   TIMESTAMPTZ,
        "last_full_reconcile_at" TIMESTAMPTZ,
        "webhook_status"         VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
        "freeze_active"          BOOLEAN     NOT NULL DEFAULT false,
        "freeze_since"           TIMESTAMPTZ,
        "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_billing_provider_health" PRIMARY KEY ("merchant_profile_key"),
        CONSTRAINT "CHK_billing_provider_health_webhook_status"
          CHECK ("webhook_status" IN ('OK','PAUSED','UNKNOWN')),
        CONSTRAINT "CHK_billing_provider_health_freeze"
          CHECK ("freeze_active" = ("freeze_since" IS NOT NULL))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "billing"."operator_audit" (
        "id"          UUID         NOT NULL,
        "tenant_id"   UUID         NOT NULL,
        "actor"       VARCHAR(100) NOT NULL,
        "action"      VARCHAR(20)  NOT NULL,
        "payload"     JSONB        NOT NULL,
        "occurred_at" TIMESTAMPTZ  NOT NULL,
        CONSTRAINT "PK_billing_operator_audit" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_billing_operator_audit_action"
          CHECK ("action" IN ('GRACE','SUSPEND','UNSUSPEND','SET_EXEMPT'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_billing_operator_audit_tenant_occurred"
        ON "billing"."operator_audit" ("tenant_id", "occurred_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // btree_gist is deliberately kept: booking.bookings' exclusion constraints depend on it.
    await queryRunner.query('DROP SCHEMA IF EXISTS "billing" CASCADE');
  }
}
