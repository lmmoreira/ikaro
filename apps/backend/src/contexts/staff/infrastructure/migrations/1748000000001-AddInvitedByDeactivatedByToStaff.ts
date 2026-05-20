import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvitedByDeactivatedByToStaff1748000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "staff"."staff"
        ADD COLUMN IF NOT EXISTS "invited_by"    UUID,
        ADD COLUMN IF NOT EXISTS "deactivated_by" UUID
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "staff"."staff"
        DROP COLUMN IF EXISTS "invited_by",
        DROP COLUMN IF EXISTS "deactivated_by"
    `);
  }
}
