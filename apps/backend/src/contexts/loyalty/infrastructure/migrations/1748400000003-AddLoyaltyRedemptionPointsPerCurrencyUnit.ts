import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLoyaltyRedemptionPointsPerCurrencyUnit1748400000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "loyalty"."loyalty_redemptions"
        ADD COLUMN IF NOT EXISTS "points_per_currency_unit" INTEGER NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "loyalty"."loyalty_redemptions"
        DROP COLUMN IF EXISTS "points_per_currency_unit"
    `);
  }
}
