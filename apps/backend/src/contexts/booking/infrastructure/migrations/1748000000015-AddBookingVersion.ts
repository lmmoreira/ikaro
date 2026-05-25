import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingVersion1748000000015 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        DROP COLUMN IF EXISTS "version"
    `);
  }
}
