import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingDiscountByPoints1748400000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        ADD COLUMN IF NOT EXISTS "discount_points_used" INTEGER NULL,
        ADD COLUMN IF NOT EXISTS "discount_amount" NUMERIC(10,2) NULL,
        ADD CONSTRAINT "CHK_booking_bookings_discount_consistency" CHECK (
          ("discount_points_used" IS NULL AND "discount_amount" IS NULL)
          OR ("discount_points_used" > 0 AND "discount_amount" > 0)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        DROP CONSTRAINT IF EXISTS "CHK_booking_bookings_discount_consistency",
        DROP COLUMN IF EXISTS "discount_points_used",
        DROP COLUMN IF EXISTS "discount_amount"
    `);
  }
}
