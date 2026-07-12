import { MigrationInterface, QueryRunner } from 'typeorm';

const APPROVED_SLOT_EXCLUSION = 'EX_booking_bookings_approved_slot';

export class AddBookingApprovedSlotExclusion1748400000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        ADD COLUMN IF NOT EXISTS "scheduled_end_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      UPDATE "booking"."bookings"
         SET "scheduled_end_at" = "scheduled_at" + ("total_duration_mins" * interval '1 minute')
       WHERE "scheduled_end_at" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        ALTER COLUMN "scheduled_end_at" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        ADD CONSTRAINT "${APPROVED_SLOT_EXCLUSION}"
        EXCLUDE USING gist (
          "tenant_id" WITH =,
          tstzrange("scheduled_at", "scheduled_end_at", '[)') WITH &&
        )
        WHERE ("status" = 'APPROVED')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        DROP CONSTRAINT IF EXISTS "${APPROVED_SLOT_EXCLUSION}"
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        DROP COLUMN IF EXISTS "scheduled_end_at"
    `);
  }
}
