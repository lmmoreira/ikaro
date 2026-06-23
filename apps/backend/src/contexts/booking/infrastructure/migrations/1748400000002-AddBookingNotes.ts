import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingNotes1748400000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        ADD COLUMN IF NOT EXISTS "notes" TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        DROP COLUMN IF EXISTS "notes"
    `);
  }
}
