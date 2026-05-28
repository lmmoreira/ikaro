import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoyaltyBalancesRedemptionsExpiryLog1748000000017 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "loyalty"."loyalty_balances" (
        "tenant_id"      UUID        NOT NULL,
        "customer_id"    UUID        NOT NULL,
        "current_points" INTEGER     NOT NULL DEFAULT 0 CHECK (current_points >= 0),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_balances" PRIMARY KEY ("tenant_id", "customer_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_loyalty_balances_tenant_customer"
        ON "loyalty"."loyalty_balances" ("tenant_id", "customer_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "loyalty"."loyalty_redemptions" (
        "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"       UUID        NOT NULL,
        "customer_id"     UUID        NOT NULL,
        "points_redeemed" INTEGER     NOT NULL CHECK (points_redeemed > 0),
        "redeemed_by"     UUID        NOT NULL,
        "notes"           TEXT,
        "booking_id"      UUID,
        "redeemed_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_redemptions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_loyalty_redemptions_tenant_customer"
        ON "loyalty"."loyalty_redemptions" ("tenant_id", "customer_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "loyalty"."balance_expiry_log" (
        "entry_id"     UUID        NOT NULL,
        "processed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_balance_expiry_log" PRIMARY KEY ("entry_id"),
        CONSTRAINT "FK_balance_expiry_log_entry"
          FOREIGN KEY ("entry_id") REFERENCES "loyalty"."loyalty_entries" ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty"."balance_expiry_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty"."loyalty_redemptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty"."loyalty_balances"`);
  }
}
