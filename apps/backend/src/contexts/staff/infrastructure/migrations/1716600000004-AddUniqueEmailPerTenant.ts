import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueEmailPerTenant1716600000004 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Emails are always stored lowercase (Email VO enforces this), so a plain
    // unique index on (tenant_id, email) is sufficient.
    await queryRunner.query(`
      CREATE UNIQUE INDEX UQ_staff_tenant_email
      ON staff.staff (tenant_id, email)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS staff.UQ_staff_tenant_email`);
  }
}
