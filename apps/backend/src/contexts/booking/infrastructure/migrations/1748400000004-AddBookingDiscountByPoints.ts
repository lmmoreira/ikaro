import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingDiscountByPoints1748400000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        ADD COLUMN IF NOT EXISTS "discount_points_used" INTEGER NULL,
        ADD COLUMN IF NOT EXISTS "discount_amount" NUMERIC(10,2) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        DROP COLUMN IF EXISTS "discount_points_used",
        DROP COLUMN IF EXISTS "discount_amount"
    `);
  }
}
