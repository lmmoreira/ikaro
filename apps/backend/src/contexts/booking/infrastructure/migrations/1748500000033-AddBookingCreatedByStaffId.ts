import { MigrationInterface, QueryRunner } from 'typeorm';

// M23-S39 (UC-108) — a booking staff create on a customer's behalf records who created it.
//
// Expand-only and backward compatible: a plain nullable ADD COLUMN takes no table rewrite and no
// long lock, and old code that never writes it keeps working. No FK (a cross-context reference to
// staff.staff) and no backfill — every existing booking was self-service, so NULL is correct.
export class AddBookingCreatedByStaffId1748500000033 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings" ADD COLUMN "created_by_staff_id" UUID NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings" DROP COLUMN "created_by_staff_id"
    `);
  }
}
